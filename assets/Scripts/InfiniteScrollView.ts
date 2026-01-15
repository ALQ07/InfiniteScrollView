import { _decorator, Component, EventTouch, instantiate, Node, UITransform, v3 } from 'cc';
const { ccclass, property } = _decorator;
/**
 * 将此脚本挂在任意Node上，然后在Node下面添加一个item节点作为原型，
 * 脚本会根据原型节点的大小和间隔，动态创建和管理子节点，实现无限滚动效果。
 * 垂直时，Node锚点应为：（0.5,1）
 * 水平时，Node锚点应为：（0,0.5）
 */
@ccclass('InfiniteScrollView')
export class InfiniteScrollView extends Component {
    @property({ type: Number, tooltip: '水平或垂直滚动：0-水平，1-垂直' }) scrollDir: number = 0
    @property({ type: Number, tooltip: '垂直滚动时的列数', visible: function (this: InfiniteScrollView) { return this.scrollDir === 1; } }) gridColumns: number = 1
    @property({ type: Number, tooltip: '水平滚动时的行数', visible: function (this: InfiniteScrollView) { return this.scrollDir === 0; } }) gridRows: number = 1
    @property({ type: Number, tooltip: '相邻子节点横向间隔（x方向）' }) spacingX: number = 50
    @property({ type: Number, tooltip: '相邻子节点纵向间隔（y方向）' }) spacingY: number = 50
    @property({ type: Number, tooltip: '容器左内边距' }) paddingLeft: number = 0
    @property({ type: Number, tooltip: '容器右内边距' }) paddingRight: number = 0
    @property({ type: Number, tooltip: '容器上内边距' }) paddingTop: number = 0
    @property({ type: Number, tooltip: '容器下内边距' }) paddingBottom: number = 0
    @property({ type: Boolean, tooltip: '是否开启惯性滚动' }) inertia: boolean = true
    @property({ type: Number, tooltip: '惯性刹车系数（0~1，越小停止越快）', range: [0, 1, 0.01], slide: true, visible: function (this: InfiniteScrollView) { return this.inertia; } }) brake: number = 0.8
    @property({ type: Boolean, tooltip: '回弹效果（允许越界并松手回弹）' }) elastic: boolean = true
    @property({ type: Number, tooltip: '回弹阻尼系数（越大越难拉，1为默认）', visible: function (this: InfiniteScrollView) { return this.elastic; } }) bounceDamping: number = 1
    @property({ type: Boolean, tooltip: '是否双向循环滚动' }) circular: boolean = false
    @property({ type: Boolean, tooltip: '放大镜效果' }) zoom: boolean = false

    private itemLength: number = 0
    private itemWidth: number = 0
    private itemHeight: number = 0
    private contentLength: number = 0
    private items: Node[] = []
    private startTimeStamp: number = 0
    private scrollSpeed: number = 0
    private maxScale: number = 1.8
    private minScale: number = 1
    private speedThreshold: number = 150
    private speedDirection: number = 0
    private isInertialScroll: boolean = false
    private isTouching: boolean = false
    private t_callback: () => void
    private loadcb: (itemNode: Node, index: number) => void
    private startIndex: number = 0
    private lastIndex: number = 0
    private maxIndex: number = 0
    protected onLoad(): void {
        // this.initData()
    }

    update(deltaTime: number) {
        if (this.scrollSpeed == 0) {
            if (this.elastic && !this.circular && !this.isTouching) {
                const rebound = this.getReboundOffset();
                if (Math.abs(rebound) > 0.001) {
                    const step = Math.abs(rebound) < 0.5 ? rebound : rebound * Math.min(1, deltaTime * 12);
                    this.node.children.forEach((item, index) => {
                        item.position = v3(
                            this.scrollDir ? item.position.x : item.position.x + step,
                            this.scrollDir ? item.position.y + step : item.position.y,
                            0
                        )
                    })
                    this.updateScale()
                }
            }
            return
        }

        const moved = this.moveItem(- this.scrollSpeed * deltaTime)
        if (Math.abs(moved) < 0.001 && this.scrollSpeed !== 0) {
            this.scrollSpeed = 0
        }
        this.updateScale()
        if (this.elastic && !this.circular && !this.isTouching && this.getReboundOffset() !== 0) {
            this.scrollSpeed = 0
            return
        }
        this.updateItemPos(-this.scrollSpeed)

        const brake = Math.max(0, Math.min(1, this.brake))
        const factor = brake === 0 ? 0 : Math.pow(brake, deltaTime * 10)
        this.speedDirection = this.scrollSpeed > 0 ? -1 : 1
        this.scrollSpeed *= factor
        if (Math.abs(this.scrollSpeed) < this.speedThreshold) {
            this.scrollSpeed = 0
        }
    }

    /**
     * 更新当前展示出来的项的数据
     */
    public refreshItems() {
        if (!this.loadcb) return;
        this.items.forEach((item, i) => {
            // items[0] 对应 startIndex
            // items[1] 对应 startIndex + 1
            // ...
            const dataIndex = this.startIndex + i;
            this.loadcb(item, dataIndex);
        });
    }

    /**
     * 初始化数据（只在初始化调用一次）
     * @param itemCount 项数
     * @param eachOneItemLoadCB 每个项的加载回调
     */
    public initData(itemCount: number, eachOneItemLoadCB: (itemNode: Node, index: number) => void) {
        if (itemCount <= 0) return
        this.items.length = 0

        this.loadcb = eachOneItemLoadCB
        this.startIndex = 0
        this.maxIndex = itemCount - 1

        const templateItem = this.node.children[0]
        if (!templateItem) return

        const itemTrans = templateItem.getComponent(UITransform);
        this.itemWidth = itemTrans.width;
        this.itemHeight = itemTrans.height;
        this.itemLength = this.scrollDir ? this.itemHeight : this.itemWidth;

        const contentTrans = this.node.getComponent(UITransform);
        this.contentLength = this.scrollDir ? contentTrans.height : contentTrans.width

        const groupSize = this.scrollDir ? this.gridColumns : this.gridRows;
        const stepX = this.itemWidth + this.spacingX;
        const stepY = this.itemHeight + this.spacingY;

        const viewMainLength = this.scrollDir
            ? (this.contentLength - this.paddingTop - this.paddingBottom)
            : (this.contentLength - this.paddingLeft - this.paddingRight)
        const stepMain = this.scrollDir ? stepY : stepX
        const mainGroups = Math.max(1, Math.ceil(viewMainLength / stepMain) + 2)

        let poolCount = mainGroups * groupSize
        if (itemCount < groupSize) poolCount = itemCount
        else {
            poolCount = Math.min(poolCount, itemCount)
            poolCount = Math.floor(poolCount / groupSize) * groupSize
            poolCount = Math.max(groupSize, poolCount)
        }

        while (this.node.children.length < poolCount) {
            const cloned = instantiate(templateItem)
            cloned.parent = this.node
        }
        while (this.node.children.length > poolCount) {
            const extra = this.node.children[this.node.children.length - 1]
            extra.removeFromParent()
            extra.destroy()
        }

        this.lastIndex = poolCount - 1

        // 计算副轴起始位置，使网格居中
        const crossTotal = groupSize * (this.scrollDir ? this.itemWidth : this.itemHeight)
            + (groupSize - 1) * (this.scrollDir ? this.spacingX : this.spacingY);
        let crossStart = this.scrollDir ? (-crossTotal / 2 + this.itemWidth / 2) : (crossTotal / 2 - this.itemHeight / 2);
        if (this.scrollDir) crossStart += (this.paddingLeft - this.paddingRight) / 2;
        else crossStart += (this.paddingBottom - this.paddingTop) / 2;

        this.node.children.forEach((item, index) => {
            this.items.push(item)
            item.getComponent(UITransform).setAnchorPoint(0.5, 0.5)

            const mainIndex = Math.floor(index / groupSize);
            const crossIndex = index % groupSize;

            if (this.scrollDir) {
                // 垂直滚动
                const x = crossStart + crossIndex * stepX;
                const y = -this.paddingTop - mainIndex * stepY - this.itemHeight / 2;
                item.position = v3(x, y, 0);
            } else {
                // 水平滚动
                const x = this.paddingLeft + mainIndex * stepX + this.itemWidth / 2;
                const y = crossStart - crossIndex * stepY;
                item.position = v3(x, y, 0);
            }

            this.loadcb(item, index)
        })
        this.updateScale()
        this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            this.isTouching = true
            this.startTimeStamp = new Date().getTime()
            this.scrollSpeed = 0
            // this.unschedule(this.t_callback)
        }, this)
        this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            let delta = event.getDelta()
            console.log(delta)
            let pos = this.node.position
            this.updateScale()
            this.moveItem(this.scrollDir ? delta.y : delta.x)
            this.updateItemPos(this.scrollDir ? delta.y : delta.x)
        }, this)
        this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            this.isTouching = false
            if (!this.inertia) {
                this.scrollSpeed = 0
                return
            }

            const nowTimeStamp = new Date().getTime()
            const diffTimeStamp = (nowTimeStamp - this.startTimeStamp) / 1000
            const diffX = event.getStartLocation().x - event.getLocation().x
            const diffY = event.getStartLocation().y - event.getLocation().y
            this.scrollSpeed = diffTimeStamp <= 0 ? 0 : (this.scrollDir ? diffY / diffTimeStamp : diffX / diffTimeStamp)
            if (this.elastic && !this.circular && this.getReboundOffset() !== 0) this.scrollSpeed = 0
        }, this)
        this.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            this.isTouching = false
            this.scrollSpeed = 0
            this.updateScale()
        }, this)
    }

    private getReboundOffset(): number {
        if (this.items.length === 0) return 0

        const firstItem = this.items[0]
        const lastItem = this.items[this.items.length - 1]
        const leftLimit = this.paddingLeft + this.itemLength / 2
        const rightLimit = this.contentLength - this.paddingRight - this.itemLength / 2
        const topLimit = -this.paddingTop - this.itemLength / 2
        const bottomLimit = -(this.contentLength - this.paddingBottom - this.itemLength / 2)

        if (this.scrollDir) {
            if (this.startIndex === 0 && firstItem.position.y < topLimit) return topLimit - firstItem.position.y
            if (this.lastIndex === this.maxIndex && lastItem.position.y > bottomLimit) return bottomLimit - lastItem.position.y
            return 0
        }

        if (this.startIndex === 0 && firstItem.position.x > leftLimit) return leftLimit - firstItem.position.x
        if (this.lastIndex === this.maxIndex && lastItem.position.x < rightLimit) return rightLimit - lastItem.position.x
        return 0
    }

    private moveItem(pos: number): number {
        if (this.items.length === 0) return 0

        if (this.circular) {
            this.node.children.forEach((item, index) => {
                item.position = v3(this.scrollDir ? item.position.x : item.position.x + pos, this.scrollDir ? item.position.y + pos : item.position.y, 0)
            })
            return pos
        }

        const firstItem = this.items[0]
        const lastItem = this.items[this.items.length - 1]
        const leftLimit = this.paddingLeft + this.itemLength / 2
        const rightLimit = this.contentLength - this.paddingRight - this.itemLength / 2
        const topLimit = -this.paddingTop - this.itemLength / 2
        const bottomLimit = -(this.contentLength - this.paddingBottom - this.itemLength / 2)

        const resistanceBaseRaw = this.itemLength + (this.scrollDir ? this.spacingY : this.spacingX)
        const resistanceBase = resistanceBaseRaw > 1 ? resistanceBaseRaw : 200
        const bounceDamping = this.bounceDamping > 0 ? this.bounceDamping : 0.01
        const elasticBaseRaw = this.isTouching ? resistanceBase : resistanceBase * 0.35
        const elasticBase = elasticBaseRaw / bounceDamping
        // 非触摸状态最大超出范围
        const maxOver = this.isTouching ? Number.POSITIVE_INFINITY : Math.max(40, resistanceBase * 3)

        // 向上滑 (pos > 0)，内容上移 / 向右滑 (pos > 0)，内容右移
        if (pos > 0) {
            if (this.scrollDir && this.lastIndex === this.maxIndex) {
                const targetY = lastItem.position.y + pos
                if (targetY > bottomLimit) {
                    if (this.elastic) {
                        const over = targetY - bottomLimit
                        pos = pos / (1 + over / elasticBase)
                        if (Number.isFinite(maxOver)) {
                            const nextY = lastItem.position.y + pos
                            const maxY = bottomLimit + maxOver
                            if (nextY > maxY) pos = maxY - lastItem.position.y
                        }
                    } else {
                        const fix = bottomLimit - lastItem.position.y
                        // 如果已经超出或刚好在边界，则不再移动
                        if (fix < 0) pos = 0
                        else pos = fix
                    }
                }
            } else if (!this.scrollDir && this.startIndex === 0) {
                const targetX = firstItem.position.x + pos
                if (targetX > leftLimit) {
                    if (this.elastic) {
                        const over = targetX - leftLimit
                        pos = pos / (1 + over / elasticBase)
                        if (Number.isFinite(maxOver)) {
                            const nextX = firstItem.position.x + pos
                            const maxX = leftLimit + maxOver
                            if (nextX > maxX) pos = maxX - firstItem.position.x
                        }
                    } else {
                        const fix = leftLimit - firstItem.position.x
                        // 如果已经超出或刚好在边界，则不再移动
                        if (fix < 0) pos = 0
                        else pos = fix
                    }
                }
            }
        }
        // 向下滑 (pos < 0)，内容下移 / 向左滑 (pos < 0)，内容左移
        else if (pos < 0) {
            if (this.scrollDir && this.startIndex === 0) {
                const targetY = firstItem.position.y + pos
                if (targetY < topLimit) {
                    if (this.elastic) {
                        const over = topLimit - targetY
                        pos = pos / (1 + over / elasticBase)
                        if (Number.isFinite(maxOver)) {
                            const nextY = firstItem.position.y + pos
                            const minY = topLimit - maxOver
                            if (nextY < minY) pos = minY - firstItem.position.y
                        }
                    } else {
                        const fix = topLimit - firstItem.position.y
                        // 如果已经超出或刚好在边界，则不再移动
                        if (fix > 0) pos = 0
                        else pos = fix
                    }
                }
            } else if (!this.scrollDir && this.lastIndex === this.maxIndex) {
                const targetX = lastItem.position.x + pos
                if (targetX < rightLimit) {
                    if (this.elastic) {
                        const over = rightLimit - targetX
                        pos = pos / (1 + over / elasticBase)
                        if (Number.isFinite(maxOver)) {
                            const nextX = lastItem.position.x + pos
                            const minX = rightLimit - maxOver
                            if (nextX < minX) pos = minX - lastItem.position.x
                        }
                    } else {
                        const fix = rightLimit - lastItem.position.x
                        // 如果已经超出或刚好在边界，则不再移动
                        if (fix > 0) pos = 0
                        else pos = fix
                    }
                }
            }
        }

        if (Math.abs(pos) < 0.001) return 0

        this.node.children.forEach((item, index) => {
            item.position = v3(this.scrollDir ? item.position.x : item.position.x + pos, this.scrollDir ? item.position.y + pos : item.position.y, 0)
        })
        return pos
    }

    private updateScale() {
        if (!this.zoom) return;
        if (this.scrollDir) {
            const half = (this.contentLength - this.paddingTop - this.paddingBottom) / 2
            if (half <= 0) return
            const centerPos = -(this.paddingTop + half)
            this.node.children.forEach((item, index) => {
                const preRaw = 1 - Math.abs((item.position.y - centerPos) / half)
                const pre = Math.max(0, Math.min(1, preRaw))
                let scale = this.maxScale - this.minScale
                scale = scale * pre + this.minScale
                item.setScale(scale, scale, scale)
            })
        } else {
            const half = (this.contentLength - this.paddingLeft - this.paddingRight) / 2
            if (half <= 0) return
            const centerPos = this.paddingLeft + half
            this.node.children.forEach((item, index) => {
                const preRaw = 1 - Math.abs((item.position.x - centerPos) / half)
                const pre = Math.max(0, Math.min(1, preRaw))
                let scale = this.maxScale - this.minScale
                scale = scale * pre + this.minScale
                item.setScale(scale, scale, scale)
            })
        }
    }

    private updateItemPos(direction: number) {
        if (direction == 0) return
        const groupSize = this.scrollDir ? this.gridColumns : this.gridRows;
        if (this.items.length < groupSize) return;

        const startItem = this.items[0]
        const endItem = this.items[this.items.length - 1]

        // 垂直滚动：direction < 0 (下滑，内容下移) -> 底部出界，尾移头
        // 垂直滚动：direction > 0 (上滑，内容上移) -> 顶部出界，头移尾
        // 水平滚动：direction < 0 (左滑，内容左移) -> 头部出界，头移尾
        // 水平滚动：direction > 0 (右滑，内容右移) -> 尾部出界，尾移头

        if (direction < 0) {
            if (!this.circular && this.scrollDir && this.startIndex === 0) return
            if (!this.circular && !this.scrollDir && this.lastIndex === this.maxIndex) return

            // 垂直滚动：下滑，底部元素出界，放到顶部
            if (this.scrollDir && endItem.position.y < -this.contentLength - this.itemLength / 2) {
                const movingItems = this.items.splice(this.items.length - groupSize, groupSize);
                this.items.unshift(...movingItems);
                const refItem = this.items[groupSize];

                const step = this.itemLength + (this.scrollDir ? this.spacingY : this.spacingX);
                movingItems.forEach((item, i) => {
                    item.position = v3(item.position.x, refItem.position.y + step, 0);
                    this.loadcb(item, this.startIndex - groupSize + i);
                });
                this.startIndex -= groupSize;
                this.lastIndex -= groupSize;
            }

            // 水平滚动：左滑，头部元素出界，放到底部
            if (!this.scrollDir && startItem.position.x < -this.itemLength / 2) {
                const movingItems = this.items.splice(0, groupSize);
                this.items.push(...movingItems);
                const refItem = this.items[this.items.length - 1 - groupSize];

                const step = this.itemLength + (this.scrollDir ? this.spacingY : this.spacingX);
                movingItems.forEach((item, i) => {
                    item.position = v3(refItem.position.x + step, item.position.y, 0);
                    this.loadcb(item, this.lastIndex + 1 + i);
                });
                this.startIndex += groupSize;
                this.lastIndex += groupSize;
            }

        } else {
            if (!this.circular && this.scrollDir && this.lastIndex === this.maxIndex) return
            if (!this.circular && !this.scrollDir && this.startIndex === 0) return

            // 垂直滚动：上滑，顶部元素出界，放到底部
            if (this.scrollDir && startItem.position.y > this.itemLength / 2) {
                const movingItems = this.items.splice(0, groupSize);
                this.items.push(...movingItems);
                const refItem = this.items[this.items.length - 1 - groupSize];

                const step = this.itemLength + (this.scrollDir ? this.spacingY : this.spacingX);
                movingItems.forEach((item, i) => {
                    item.position = v3(item.position.x, refItem.position.y - step, 0);
                    this.loadcb(item, this.lastIndex + 1 + i);
                });
                this.startIndex += groupSize;
                this.lastIndex += groupSize;
            }

            // 水平滚动：右滑，尾部元素出界，放到顶部
            if (!this.scrollDir && endItem.position.x > this.contentLength + this.itemLength / 2) {
                const movingItems = this.items.splice(this.items.length - groupSize, groupSize);
                this.items.unshift(...movingItems);
                const refItem = this.items[groupSize];

                const step = this.itemLength + (this.scrollDir ? this.spacingY : this.spacingX);
                movingItems.forEach((item, i) => {
                    item.position = v3(refItem.position.x - step, item.position.y, 0);
                    this.loadcb(item, this.startIndex - groupSize + i);
                });
                this.startIndex -= groupSize;
                this.lastIndex -= groupSize;
            }
        }
    }
}


