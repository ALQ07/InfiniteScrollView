import { _decorator, Component, EventTouch, Node, UITransform, v3 } from 'cc';
const { ccclass, property } = _decorator;
/**
 * 将此脚本挂在content节点上，然后在content下面添加组成循环的item即可使用
 * 垂直时，content锚点应为：（0.5,1）
 * 水平时，content锚点应为：（0,0.5）
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
    private t_callback: () => void
    private loadcb: (itemNode: Node, index: number) => void
    private startIndex: number = 0
    private lastIndex: number = 0
    private maxIndex: number = 0
    protected onLoad(): void {
        // this.initData()
    }

    update(deltaTime: number) {
        if (this.scrollSpeed == 0) return
        const moved = this.moveItem(- this.scrollSpeed * deltaTime)
        if (Math.abs(moved) < 0.001 && this.scrollSpeed !== 0) {
            this.scrollSpeed = 0
        }
        this.updateScale()
        this.updateItemPos(-this.scrollSpeed)
        if (this.scrollSpeed > 0) {
            // 左滑/下滑
            this.speedDirection = -1
            this.scrollSpeed -= deltaTime * 1500
            if (this.scrollSpeed < this.speedThreshold) {
                this.scrollSpeed = 0
            }
        } else {
            // 右滑/上滑
            this.speedDirection = 1
            this.scrollSpeed += deltaTime * 1500
            if (this.scrollSpeed > -this.speedThreshold) {
                this.scrollSpeed = 0
            }
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
        this.loadcb = eachOneItemLoadCB
        this.startIndex = 0
        this.lastIndex = this.node.children.length - 1
        this.maxIndex = itemCount - 1

        const itemTrans = this.node.children[0].getComponent(UITransform);
        this.itemWidth = itemTrans.width;
        this.itemHeight = itemTrans.height;
        this.itemLength = this.scrollDir ? this.itemHeight : this.itemWidth;

        const contentTrans = this.node.getComponent(UITransform);
        this.contentLength = this.scrollDir ? contentTrans.height : contentTrans.width

        const groupSize = this.scrollDir ? this.gridColumns : this.gridRows;
        const stepX = this.itemWidth + this.spacingX;
        const stepY = this.itemHeight + this.spacingY;

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
            const nowTimeStamp = new Date().getTime()
            const diffTimeStamp = (nowTimeStamp - this.startTimeStamp) / 1000
            const diffX = event.getStartLocation().x - event.getLocation().x
            const diffY = event.getStartLocation().y - event.getLocation().y
            this.scrollSpeed = this.scrollDir ? diffY / diffTimeStamp : diffX / diffTimeStamp
        }, this)
        this.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            this.updateScale()
        }, this)
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

        // 向上滑 (pos > 0)，内容上移 / 向右滑 (pos > 0)，内容右移
        if (pos > 0) {
            if (this.scrollDir && this.lastIndex === this.maxIndex) {
                const targetY = lastItem.position.y + pos
                if (targetY > bottomLimit) {
                    const fix = bottomLimit - lastItem.position.y
                    // 如果已经超出或刚好在边界，则不再移动
                    if (fix < 0) pos = 0
                    else pos = fix
                }
            } else if (!this.scrollDir && this.startIndex === 0) {
                const targetX = firstItem.position.x + pos
                if (targetX > leftLimit) {
                    const fix = leftLimit - firstItem.position.x
                    // 如果已经超出或刚好在边界，则不再移动
                    if (fix < 0) pos = 0
                    else pos = fix
                }
            }
        }
        // 向下滑 (pos < 0)，内容下移 / 向左滑 (pos < 0)，内容左移
        else if (pos < 0) {
            if (this.scrollDir && this.startIndex === 0) {
                const targetY = firstItem.position.y + pos
                if (targetY < topLimit) {
                    const fix = topLimit - firstItem.position.y
                    // 如果已经超出或刚好在边界，则不再移动
                    if (fix > 0) pos = 0
                    else pos = fix
                }
            } else if (!this.scrollDir && this.lastIndex === this.maxIndex) {
                const targetX = lastItem.position.x + pos
                if (targetX < rightLimit) {
                    const fix = rightLimit - lastItem.position.x
                    // 如果已经超出或刚好在边界，则不再移动
                    if (fix > 0) pos = 0
                    else pos = fix
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
                const pre = 1 - Math.abs((item.position.y - centerPos) / half)
                let scale = this.maxScale - this.minScale
                scale = scale * pre + this.minScale
                item.setScale(scale, scale, scale)
            })
        } else {
            const half = (this.contentLength - this.paddingLeft - this.paddingRight) / 2
            if (half <= 0) return
            const centerPos = this.paddingLeft + half
            this.node.children.forEach((item, index) => {
                const pre = 1 - Math.abs((item.position.x - centerPos) / half)
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
            if (this.scrollDir && endItem.position.y < -(this.contentLength - this.paddingBottom) - this.itemLength / 2) {
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
            if (!this.scrollDir && startItem.position.x < this.paddingLeft - this.itemLength / 2) {
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
            if (this.scrollDir && startItem.position.y > -this.paddingTop + this.itemLength / 2) {
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
            if (!this.scrollDir && endItem.position.x > (this.contentLength - this.paddingRight) + this.itemLength / 2) {
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


