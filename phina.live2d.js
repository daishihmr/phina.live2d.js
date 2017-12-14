phina.namespace(function() {

  phina.define("phina.live2d.MocAsset", {
    superClass: "phina.asset.Asset",

    init: function() {
      this.superInit();
    },

    _load: function(resolve) {
      var self = this;
      var xhr = new XMLHttpRequest();
      xhr.open("GET", this.src);
      xhr.responseType = "arraybuffer";
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if ([200, 201, 0].indexOf(xhr.status) !== -1) {
            var data = xhr.response;
            self.data = LIVE2DCUBISMCORE.Moc.fromArrayBuffer(data);
            resolve(self);
          }
        }
      };
      xhr.send(null);
    },
  });
  phina.asset.AssetLoader.assetLoadFunctions["live2d.moc"] = function(key, path) {
    var asset = phina.live2d.MocAsset();
    return asset.load(path);
  };

  phina.define("phina.live2d.MotionAsset", {
    superClass: "phina.asset.File",

    init: function() {
      this.superInit();
    },

    _load: function(resolve) {
      var before = phina.util.Flow(function(r) {
        this.superMethod("_load", r);
      }.bind(this));

      before.then(function() {
        this.data = LIVE2DCUBISMFRAMEWORK.Animation.fromMotion3Json(this.data);
        resolve(this);
      }.bind(this));
    },
  });
  phina.asset.AssetLoader.assetLoadFunctions["live2d.motion"] = function(key, path) {
    var asset = phina.live2d.MotionAsset();
    return asset.load({
      path: path,
      dataType: "json",
    });
  };

  phina.define("phina.live2d.Live2dLayer", {
    superClass: "phina.display.Layer",

    init: function(options) {
      this.superInit(options);
      this.domElement = document.createElement("canvas");
      this.domElement.width = this.width;
      this.domElement.height = this.height;

      var gl = this.domElement.getContext("webgl", { stencil: true }) || this.domElement.getContext("experimental-webgl", { stencil: true });
      if (this.width > this.height) {
        gl.viewport(0, (this.height - this.width) / 2, this.width, this.width);
      } else {
        gl.viewport((this.width - this.height) / 2, 0, this.height, this.height);
      }
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clearStencil(0);
      gl.enable(gl.BLEND);
      gl.enable(gl.STENCIL_TEST);

      this.gl = gl;
    },

    draw: function(canvas) {
      var gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      this._drawChildren(this);
      gl.flush();

      var image = this.domElement;
      canvas.context.drawImage(image,
        0, 0, image.width, image.height, -this.width * this.originX, -this.height * this.originY, this.width, this.height
      );
    },

    _drawChildren: function(elm) {
      if (elm.drawWebGL) elm.drawWebGL(this);
      for (var i = 0; i < elm.children.length; ++i) {
        this._drawChildren(elm.children[i]);
      }
    },

  });

  phina.define("phina.live2d.Live2dSprite", {
    superClass: "phina.app.Object2D",

    coreModel: null,
    textures: null,
    animator: null,

    init: function(gl, options) {
      this.superInit(options);
      options = ({}).$safe(options, phina.live2d.Live2dSprite.defaults);
      this._initCore(gl, options);
      this._initTextures(gl, options);
      this._initMeshes(gl, options);
      this._initAnimator(gl, options);
    },

    _initCore: function(gl, options) {
      var moc = typeof(options.moc) === "string" ? AssetManager.get("live2d.moc", options.moc) : options.moc;
      this.coreModel = LIVE2DCUBISMCORE.Model.fromMoc(moc.data);
      console.log(this.coreModel);
    },

    _initTextures: function(gl, options) {
      this.textures = options.textures.map(function(texture) {
        return phigl.Texture(gl, texture);
      });
    },

    _initMeshes: function(gl, options) {
      var drawables = this.coreModel.drawables;
      var textures = this.textures;
      this.meshes = Array.range(0, drawables.ids.length)
        .map(function(m) {
          var uvs = drawables.vertexUvs[m];
          uvs = uvs.slice(0, uvs.length);
          for (var v = 1; v < uvs.length; v += 2) {
            uvs[v] = 1 - uvs[v];
          }

          var mesh = phigl.Drawable(gl)
            .setProgram(phina.live2d.Live2dSprite.getProgram(gl))
            .setIndexValues(drawables.indices[m])
            .declareAttributes("vertexPosition", "uv")
            .setAttributeDataArray([{
              unitSize: 2,
              data: drawables.vertexPositions[m],
            }, {
              unitSize: 2,
              data: uvs,
            }, ], gl.DYNAMIC_DRAW)
            .declareUniforms("matrix", "visible", "texture", "alpha")
            .createVao();

          mesh.index = m;
          mesh.name = drawables.ids[m];
          mesh.uvs = uvs;
          mesh.texture = textures[drawables.textureIndices[m]];

          mesh.alpha = drawables.opacities[m];
          mesh.visible = LIVE2DCUBISMCORE.Utils.hasIsVisibleBit(drawables.dynamicFlags[m]);

          mesh.isCulling = !LIVE2DCUBISMCORE.Utils.hasIsDoubleSidedBit(drawables.constantFlags[m]);

          if (LIVE2DCUBISMCORE.Utils.hasBlendAdditiveBit(drawables.constantFlags[m])) {
            mesh.blendMode = "add";
          } else if (LIVE2DCUBISMCORE.Utils.hasBlendMultiplicativeBit(drawables.constantFlags[m])) {
            mesh.blendMode = "multiply";
          }

          return mesh;
        });

      for (var m = 0; m < drawables.ids.length; ++m) {
        if (drawables.maskCounts[m] > 0) {
          var maskIndex = drawables.masks[m][0];
          var maskMesh = this.meshes[maskIndex];
          maskMesh.isMask = true;
          this.meshes[m].mask = maskMesh.index;
        } else {
          this.meshes[m].mask = -1;
        }
      }

      this.orderedMeshes = this.meshes.clone();
    },

    _initAnimator: function(gl, options) {
      this.animatorBuilder = new LIVE2DCUBISMFRAMEWORK.AnimatorBuilder();

      options.animatorLayers.forEach(function(layer) {
        if (typeof(layer) === "string") layer = { name: layer };
        layer = ({}).$safe(layer, phina.live2d.Live2dSprite.animationLayerDefaults);
        this.animatorBuilder.addLayer(layer.name, layer.blender, layer.weight);
      }.bind(this));

      this.animator = this.animatorBuilder
        .setTarget(this.coreModel)
        .setTimeScale(options.timeScale)
        .build();
    },

    playMotion: function(layerName, motion) {
      if (arguments.length === 1) {
        motion = layerName;
        layerName = "base";
      }

      if (typeof(motion) === "string") {
        motion = phina.asset.AssetManager.get("live2d.motion", motion).data;
      }
      this.animator
        .getLayer(layerName)
        .play(motion);
    },

    update: function(app) {
      this.animator.updateAndEvaluate(app.deltaTime * 0.001);
      this.coreModel.update();

      var sort = false;
      var drawables = this.coreModel.drawables;
      for (var m = 0; m < this.meshes.length; ++m) {
        var mesh = this.meshes[m];
        mesh.alpha = drawables.opacities[m];
        mesh.visible = LIVE2DCUBISMCORE.Utils.hasIsVisibleBit(drawables.dynamicFlags[m]);
        if (LIVE2DCUBISMCORE.Utils.hasVertexPositionsDidChangeBit(drawables.dynamicFlags[m])) {
          mesh.vertices = drawables.vertexPositions[m];
          mesh.dirtyVertex = true;
        }
        if (LIVE2DCUBISMCORE.Utils.hasRenderOrderDidChangeBit(drawables.dynamicFlags[m])) {
          sort = true;
        }
      }

      if (sort) {
        this.orderedMeshes.sort(function(lhs, rhs) {
          return drawables.renderOrders[lhs.index] - drawables.renderOrders[rhs.index];
        });
      }
    },

    drawWebGL: function(layer) {
      var gl = layer.gl;

      for (var i = 0; i < this.orderedMeshes.length; ++i) {
        var mesh = this.orderedMeshes[i];
        if (mesh.dirtyVertex) {
          mesh.setAttributeDataArray([{
            unitSize: 2,
            data: this.coreModel.drawables.vertexPositions[mesh.index],
          }, {
            unitSize: 2,
            data: mesh.uvs,
          }, ], gl.DYNAMIC_DRAW);

          mesh.dirtyVertex = false;
        }
        this._calcWorldMatrix();
        var worldMatrix = [
          this._worldMatrix.m00, this._worldMatrix.m10, this._worldMatrix.m20,
          this._worldMatrix.m01, this._worldMatrix.m11, this._worldMatrix.m21,
          this._worldMatrix.m02, this._worldMatrix.m12, this._worldMatrix.m22,
        ];
        mesh.uniforms["matrix"].setValue(worldMatrix);
        mesh.uniforms["visible"].setValue(mesh.visible ? 1 : 0);
        mesh.uniforms["texture"].setValue(0).setTexture(mesh.texture);
        mesh.uniforms["alpha"].setValue(mesh.alpha);

        switch (mesh.blendMode) {
          case "add":
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            break;
          case "multiply":
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            break;
          default:
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            break;
        }

        if (mesh.isMask) {
          gl.stencilFunc(gl.ALWAYS, mesh.index, ~0);
          gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
        } else if (mesh.mask != -1) {
          gl.stencilFunc(gl.EQUAL, mesh.mask, ~0);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        } else {
          gl.stencilFunc(gl.ALWAYS, 0, ~0);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        }

        mesh.draw();
      }
    },

    _static: {
      defaults: {
        timeScale: 1,
        animatorLayers: [{
          name: "base",
          blender: LIVE2DCUBISMFRAMEWORK.BuiltinAnimationBlenders.OVERRIDE,
          weight: 1,
        }],
      },

      animationLayerDefaults: {
        blender: LIVE2DCUBISMFRAMEWORK.BuiltinAnimationBlenders.OVERRIDE,
        weight: 1,
      },

      _program: null,
      _vertexShader: null,
      _fragmentShader: null,

      getProgram: function(gl) {
        if (this._program == null) {
          this._program = phigl.Program(gl)
            .attach(this.getVertexShader())
            .attach(this.getFragmentShader())
            .link();
        }
        return this._program;
      },

      getVertexShader: function() {
        if (this._vertexShader == null) {
          this._vertexShader = phigl.VertexShader();
          this._vertexShader.data = [
            "attribute vec2 vertexPosition;",
            "attribute vec2 uv;",

            "uniform mat3 matrix;",
            "uniform float visible;",

            "varying vec2 vUv;",

            "void main(void) {",
            "  vUv = uv;",
            "  if (visible < 0.5) {",
            "    gl_Position = vec4(0.0);",
            "  } else {",
            "    vec3 pos = matrix * vec3(vertexPosition, 1.0);",
            "    gl_Position = vec4(pos, 1.0);",
            "  }",
            "}",
          ].join("\n");
        }
        return this._vertexShader;
      },

      getFragmentShader: function() {
        if (this._fragmentShader == null) {
          this._fragmentShader = phigl.FragmentShader();
          this._fragmentShader.data = [
            "precision mediump float;",

            "uniform sampler2D texture;",
            "uniform float alpha;",

            "varying vec2 vUv;",

            "void main(void) {",
            "  vec4 col = texture2D(texture, vUv) * vec4(1.0, 1.0, 1.0, alpha);",
            "  if (col.a == 0.0) discard;",
            "  gl_FragColor = col;",
            "}",
          ].join("\n");
        }
        return this._fragmentShader;
      },
    },
  });

});