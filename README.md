# Live2D Cubism library for phina.js

## dependency

 * [phina.js](http://phinajs.com/)
 * [live2dcubismcore.min.js](https://s3-ap-northeast-1.amazonaws.com/cubism3.live2d.com/sdk/js_eap/live2dcubismcore.min.js)
 * [live2dcubismframework.js](https://github.com/Live2D/CubismJsComponents)
 * [phigl.js](https://github.com/daishihmr/phigl.js)

## Usage

### load as asset

```
{
  assets: {
    "live2d.moc": {
      ModelDataAsset: "path/to/moc3/file"
    },
    "image": {
      TextureAsset: "path/to/png/file"
    },
    "live2d.motion": {
      MotionDataAsset: "path/to/motion3.json/file"
    },
  },
},
```

### create Live2D layer

```
let live2dLayer = phina.live2d.Live2DLayer({
  width: scene.width,
  height: scene.height,
  originX: 0,
  originY: 0,
}).addChildTo(scene);
```

### create Live2D sprite

```
let sprite = phina.live2d.Live2DSprite({
  moc: "ModelDataAsset",
  textures: ["TextureAsset0", "TextureAsset1"],
});
sprite.setPosition(scene.width / 2, scene.height / 2);
sprite.addChildTo(live2dLayer);
```

### control parameter

```
sprite.paramter["ParamAngleX"] = 30.0;
```

```.parameter``` property has tweener

```
sprite.parameter.tweener
  .to({
    "ParamAngleX": -30.0
  }, 1000, "easeInOutQuad")
  .to({
    "ParamAngleX": 30.0
  }, 1000, "easeInOutQuad");
```

### play animation

```
sprite.play("MotionDataAsset");
```

## License

MIT License

## TODO

 * Physics
 * User Data
 * fire Animation-End event
 * (cliping)
