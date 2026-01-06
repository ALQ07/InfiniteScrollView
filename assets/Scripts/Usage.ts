import { _decorator, Component, Label, Node } from 'cc';
import { InfiniteScrollView } from './InfiniteScrollView';
const { ccclass, property } = _decorator;

@ccclass('Usage')
export class Usage extends Component {
    @property(Node)
    content: Node = null;

    start() {
        this.content.getComponent(InfiniteScrollView).initData(10, (itemNode: Node, index: number) => {
            itemNode.getChildByPath('Label').getComponent(Label).string = `${index}`;
        });
    }
}