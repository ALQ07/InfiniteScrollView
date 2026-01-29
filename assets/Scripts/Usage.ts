import { _decorator, Button, Component, Label, Node } from 'cc';
import { InfiniteScrollView } from './InfiniteScrollView';
const { ccclass, property } = _decorator;

@ccclass('Usage')
export class Usage extends Component {
    @property(Node)
    content: Node = null;

    start() {
        this.content.getComponent(InfiniteScrollView).initData(1, (itemNode: Node, index: number) => {
            itemNode.getChildByPath('Label').getComponent(Label).string = `${index}`;
            itemNode.getChildByPath('Button').on(Button.EventType.CLICK, this.onClickButton, this);
        });
    }

    onClickButton() {
        console.log('click button');
    }
}