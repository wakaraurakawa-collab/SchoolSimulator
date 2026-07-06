import { CANVAS_W, CANVAS_H } from "./mapData.js";
import MainScene from "./scenes/MainScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#10131a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_W,
    height: CANVAS_H,
  },
  scene: [MainScene],
};

window.game = new Phaser.Game(config);
