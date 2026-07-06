import MainScene from "./scenes/MainScene.js";

const config = {
  type: Phaser.AUTO,
  width: 640,
  height: 384,
  parent: "game-container",
  backgroundColor: "#0d2740",
  pixelArt: true,
  scene: [MainScene],
};

window.game = new Phaser.Game(config);
