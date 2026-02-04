import { _decorator, Button, Component, EditBox, Label, Node } from 'cc';
import { InfiniteScrollView } from './InfiniteScrollView';
const { ccclass, property } = _decorator;

@ccclass('Usage')
export class Usage extends Component {
    @property(Node)
    content: Node = null;

    private itemNum: number = 0;
    private itemIndex: number = 0;

    start() {
        this.content.getComponent(InfiniteScrollView).initData(100, (itemNode: Node, index: number) => {
            itemNode.getChildByPath('Label').getComponent(Label).string = `${index}`;
            itemNode.getChildByPath('Button').on(Button.EventType.CLICK, this.onClickButton, this);
        });
    }

    onClickButton() {
        console.log('click button');
    }

    endEdit(editBox: EditBox) {
        this.itemNum = parseInt(editBox.string);
    }

    endEditIndex(editBox: EditBox) {
        this.itemIndex = parseInt(editBox.string);
    }

    refresh() {
        this.content.getComponent(InfiniteScrollView).refreshItems(this.itemNum);
    }

    scrollToIndex() {
        this.content.getComponent(InfiniteScrollView).scrollToIndex(this.itemIndex);
    }
}