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
    @property({ type: Number, tooltip: '项间距' }) spacing: number = 150
    @property({ type: Boolean, tooltip: '是否双向循环滚动' }) circular: boolean = false
    @property({ type: Boolean, tooltip: '放大镜效果' }) zoom: boolean = false

    private itemLength: number = 0
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
     * 初始化数据
     * @param itemCount 项数
     * @param eachOneItemLoadCB 每个项的加载回调
     */
    public initData(itemCount: number, eachOneItemLoadCB: (itemNode: Node, index: number) => void) {
        this.loadcb = eachOneItemLoadCB
        this.startIndex = 0
        this.lastIndex = this.node.children.length - 1
        this.maxIndex = itemCount - 1
        this.itemLength = this.scrollDir ? this.node.children[0].getComponent(UITransform).height : this.node.children[0].getComponent(UITransform).width
        this.contentLength = this.scrollDir ? this.node.getComponent(UITransform).height : this.node.getComponent(UITransform).width
        this.node.children.forEach((item, index) => {
            this.items.push(item)
            item.position = v3(this.scrollDir ? 0 : index * (this.itemLength + this.spacing) + this.itemLength / 2, this.scrollDir ? -index * (this.itemLength + this.spacing) - this.itemLength / 2 : 0, 0)
            item.getComponent(UITransform).setAnchorPoint(0.5, 0.5)
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
                item.position = v3(this.scrollDir ? 0 : item.position.x + pos, this.scrollDir ? item.position.y + pos : 0, 0)
            })
            return pos
        }

        const firstItem = this.items[0]
        const lastItem = this.items[this.items.length - 1]
        const leftLimit = this.itemLength / 2
        const rightLimit = this.contentLength - this.itemLength / 2
        const topLimit = -this.itemLength / 2
        const bottomLimit = -(this.contentLength - this.itemLength / 2)

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
            item.position = v3(this.scrollDir ? 0 : item.position.x + pos, this.scrollDir ? item.position.y + pos : 0, 0)
        })
        return pos
    }

    private updateScale() {
        if (!this.zoom) return;
        let center = this.contentLength / 2
        this.node.children.forEach((item, index) => {
            let pre: number
            if (this.scrollDir) {
                pre = 1 - Math.abs((item.position.y + center) / center)
            } else {
                if (item.position.x < center) {
                    pre = item.position.x / center
                } else {
                    pre = 1 - ((item.position.x - center) / center)
                }
            }
            let scale = this.maxScale - this.minScale
            scale = scale * pre + this.minScale
            item.setScale(scale, scale, scale)
        })
    }

    private updateItemPos(direction: number) {
        if (direction == 0) return
        const startItem = this.items[0]
        const endItem = this.items[this.items.length - 1]
        if (direction < 0) {
            if (!this.circular && this.scrollDir && this.startIndex === 0) return
            if (!this.circular && !this.scrollDir && this.lastIndex === this.maxIndex) return
            // 左滑/下滑
            if (!this.scrollDir && startItem.position.x < -this.itemLength / 2) {
                const x = endItem.position.x + this.itemLength + this.spacing
                const item = this.items.shift()
                item.position = v3(x, 0, 0)
                this.items.push(item)
                this.startIndex++
                this.lastIndex++
                this.loadcb(item, this.lastIndex)
            }
            if (this.scrollDir && endItem.position.y < -this.contentLength - this.itemLength / 2) {
                const y = startItem.position.y + this.itemLength + this.spacing
                const item = this.items.pop()
                item.position = v3(0, y, 0)
                this.items.unshift(item)
                this.startIndex--
                this.lastIndex--
                this.loadcb(item, this.startIndex)
            }
        } else {
            if (!this.circular && this.scrollDir && this.lastIndex === this.maxIndex) return
            if (!this.circular && !this.scrollDir && this.startIndex === 0) return
            // 右滑/上滑
            if (!this.scrollDir && endItem.position.x > this.contentLength + this.itemLength / 2) {
                const x = startItem.position.x - this.itemLength - this.spacing
                const item = this.items.pop()
                this.items.unshift(item)
                item.position = v3(x, 0, 0)
                this.startIndex--
                this.lastIndex--
                this.loadcb(item, this.startIndex)
            }
            if (this.scrollDir && startItem.position.y > this.itemLength / 2) {
                const y = endItem.position.y - this.itemLength - this.spacing
                const item = this.items.shift()
                item.position = v3(0, y, 0)
                this.items.push(item)
                this.startIndex++
                this.lastIndex++
                this.loadcb(item, this.lastIndex)
            }
        }
    }
}


