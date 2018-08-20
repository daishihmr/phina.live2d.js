/*
 * phina.live2d.js 1.0.0
 * https://github.com/daishihmr/phina.live2d.js
 * 
 * The MIT License (MIT)
 * Copyright © 2017 daishihmr <daishi.hmr@gmail.com> (http://github.dev7.jp/)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the “Software”), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions
 * of the Software.
 * 
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
phina.namespace(function() {

  var Utils = LIVE2DCUBISMCORE.Utils;
  var tempQuat = quat.create();

  var bufferSize = 4096;

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

  phina.define("phina.live2d.PhysicsAsset", {
    superClass: "phina.asset.File",

    init: function() {
      this.superInit();
    },
  });
  phina.asset.AssetLoader.assetLoadFunctions["live2d.physics"] = function(key, path) {
    var asset = phina.live2d.PhysicsAsset();
    return asset.load({
      path: path,
      dataType: "json",
    });
  };

  phina.define("phina.live2d.Live2DLayer", {
    superClass: "phina.display.Layer",

    init: function(options) {
      this.superInit(options);
      this.domElement = options.domElement || document.createElement("canvas");
      this.domElement.width = this.width;
      this.domElement.height = this.height;

      var gl = this.domElement.getContext("webgl", { stencil: true }) || this.domElement.getContext("experimental-webgl", { stencil: true });
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clearDepth(1);
      gl.clearStencil(0);
      gl.enable(gl.BLEND);
      gl.enable(gl.STENCIL_TEST);
      gl.cullFace(gl.BACK);
      gl.viewport(0, 0, this.width, this.height);

      this.gl = gl;

      this.offScreenBuffer = phigl.Framebuffer(gl, bufferSize, bufferSize, {
        magFilter: gl.LINEAR,
        minFilter: gl.LINEAR,
      });

      var screenVs = phigl.VertexShader();
      screenVs.data = phina.live2d.Live2DLayer.aaVs;
      var screenFs = phigl.FragmentShader();
      screenFs.data = phina.live2d.Live2DLayer.aaFs;
      var screenProgram = phigl.Program(gl)
        .attach(screenVs)
        .attach(screenFs)
        .link();
      this.screen = phigl.Drawable(gl)
        .setProgram(screenProgram)
        .setIndexValues([0, 1, 2, 1, 3, 2])
        .declareAttributes("position", "uv")
        .setAttributeDataArray([{
          unitSize: 2,
          data: [
            //
            -0.5, 0.5,
            //
            0.5, 0.5,
            //
            -0.5, -0.5,
            //
            0.5, -0.5,
          ],
        }, {
          unitSize: 2,
          data: [
            //
            0, 1,
            //
            1, 1,
            //
            0, 0,
            //
            1, 0,
          ],
        }, ])
        .declareUniforms("mMatrix", "vpMatrix", "texture", "alpha");

      this.mMatrix = mat4.create();
      var viewMatrix = mat4.lookAt(mat4.create(), [0, 0, 1], [0, 0, 0], [0, 1, 0]);
      var projectionMatrix = mat4.ortho(mat4.create(), 0, this.width, this.height, 0, 0.1, 1000);
      this.vpMatrix = mat4.create();
      this.vpMatrix = mat4.multiply(this.vpMatrix, viewMatrix, this.vpMatrix);
      this.vpMatrix = mat4.multiply(this.vpMatrix, projectionMatrix, this.vpMatrix);
    },

    draw: function(canvas) {
      var gl = this.gl;

      phigl.Framebuffer.unbind(gl);
      gl.clear(gl.COLOR_BUFFER_BIT);

      var children = this.children;
      for (var i = 0; i < children.length; i++) {
        var model = children[i];

        this.offScreenBuffer.bind();
        gl.viewport(0, 0, bufferSize, bufferSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        this._drawChildren(model);

        phigl.Framebuffer.unbind(gl);
        gl.viewport(0, 0, this.width, this.height);
        mat4.fromRotationTranslationScale(
          this.mMatrix,
          quat.fromEuler(tempQuat, 0, 0, model.rotation),
          [model.x, model.y, 0],
          [model.scaleX * bufferSize, -model.scaleY * bufferSize, 1]
        );
        this.screen.uniforms["mMatrix"].setValue(this.mMatrix);
        this.screen.uniforms["vpMatrix"].setValue(this.vpMatrix);
        this.screen.uniforms["texture"].setValue(0).setTexture(this.offScreenBuffer.texture);
        this.screen.uniforms["alpha"].setValue(children[i]._alpha);
        this.screen.draw();
      }

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

    _static: {
      aaVs: [
        "attribute vec2 position;",
        "attribute vec2 uv;",

        "uniform mat4 mMatrix;",
        "uniform mat4 vpMatrix;",

        "varying vec2 vUv;",

        "void main(void) {",
        "  vUv = uv;",
        "  gl_Position = vpMatrix * mMatrix * vec4(position, 0.0, 1.0);",
        "}",
      ].join("\n"),
      aaFs: [
        "precision mediump float;",

        "uniform sampler2D texture;",
        "uniform float alpha;",

        "varying vec2 vUv;",

        "void main(void){",
        "  vec4 c0 = texture2D(texture, vUv);",
        "  gl_FragColor = c0 * vec4(1.0, 1.0, 1.0, alpha);",
        // "  gl_FragColor = vec4(0.2, 0.2, 0.8, 1.0);",
        "}",
      ].join("\n"),
    },

  });

  phina.define("phina.live2d.Live2DSprite", {
    superClass: "phina.app.Object2D",

    gl: null,
    coreModel: null,
    textures: null,
    animator: null,
    physicsRig: null,

    parameters: null,

    canvasWidth: 0,
    canvasHeight: 0,
    pixelsPerUnit: 0,

    _alpha: 1,

    init: function(options) {
      this.superInit(options);
      options = ({}).$safe(options, phina.live2d.Live2DSprite.defaults);
      this._initCore(options);
      this._initAnimator(options);
      this._initParameters(options);
      this._initPhisics(options);
      this.$watch("gl", function() {
        this._initTextures(options);
        this._initMeshes(options);
      });
      if (options.gl) {
        this.gl = options.gl;
      }

      this.canvasWidth = this.coreModel.canvasinfo.CanvasWidth;
      this.canvasHeight = this.coreModel.canvasinfo.CanvasHeight;
      this.pixelsPerUnit = this.coreModel.canvasinfo.PixelsPerUnit;
    },

    onadded: function() {
      var findGL = function(elm) {
        if (elm.gl) return elm.gl;
        else return findGL(elm.parent);
      };
      var gl = findGL(this.parent);
      if (gl) this.gl = gl;
    },

    _initCore: function(options) {
      var moc = typeof(options.moc) === "string" ? AssetManager.get("live2d.moc", options.moc) : options.moc;
      this.coreModel = LIVE2DCUBISMCORE.Model.fromMoc(moc.data);
    },

    _initTextures: function(options) {
      var gl = this.gl;
      this.textures = options.textures.map(function(texture) {
        var tex = phigl.Texture(gl, texture);
        return tex;
      });
    },

    _initMeshes: function(options) {
      var gl = this.gl;
      var drawables = this.coreModel.drawables;
      var textures = this.textures;
      var meshCount = drawables.ids.length;
      this.meshes = Array.range(0, meshCount)
        .map(function(m) {

          var vertexPositions = drawables.vertexPositions[m];

          var uvs = drawables.vertexUvs[m];
          uvs = uvs.slice(0, uvs.length);
          for (var v = 1; v < uvs.length; v += 2) {
            uvs[v] = 1 - uvs[v];
          }

          var mesh = phigl.Drawable(gl)
            .setProgram(phina.live2d.Live2DSprite.getProgram(gl))
            .setIndexValues(drawables.indices[m])
            .declareAttributes("vertexPosition", "uv")
            .setAttributeDataArray([{
              unitSize: 2,
              data: vertexPositions,
            }, {
              unitSize: 2,
              data: uvs,
            }, ], gl.DYNAMIC_DRAW)
            .declareUniforms("visible", "texture", "opacity");

          mesh.index = m;
          mesh.name = drawables.ids[m];
          mesh.vertexPositions = vertexPositions;
          mesh.uvs = uvs;
          mesh.texture = textures[drawables.textureIndices[m]];

          mesh.opacity = drawables.opacities[m];
          mesh.visible = Utils.hasIsVisibleBit(drawables.dynamicFlags[m]);

          mesh.doubleSided = Utils.hasIsDoubleSidedBit(drawables.constantFlags[m]);

          if (Utils.hasBlendAdditiveBit(drawables.constantFlags[m])) {
            mesh.blendMode = "add";
          } else if (Utils.hasBlendMultiplicativeBit(drawables.constantFlags[m])) {
            mesh.blendMode = "multiply";
          }

          return mesh;
        });

      for (var m = 0; m < meshCount; ++m) {
        if (drawables.maskCounts[m] > 0) {
          var maskIndex = drawables.masks[m][0];
          var maskMesh = this.meshes[maskIndex];
          if (maskMesh) {
            maskMesh.isMask = true;
            this.meshes[m].mask = maskMesh.index;
          }
        } else {
          this.meshes[m].mask = -1;
        }
      }

      this.orderedMeshes = this.meshes.clone();
    },

    _initAnimator: function(options) {
      var animatorBuilder = new LIVE2DCUBISMFRAMEWORK.AnimatorBuilder();

      options.animatorLayers.forEach(function(layer) {
        if (typeof(layer) === "string") layer = { name: layer };
        layer = ({}).$safe(layer, phina.live2d.Live2DSprite.animationLayerDefaults);
        animatorBuilder.addLayer(layer.name, layer.blender, layer.weight);
      }.bind(this));

      this.animator = animatorBuilder
        .setTarget(this.coreModel)
        .setTimeScale(options.timeScale)
        .build();
    },

    _initParameters: function(options) {
      this.parameters = phina.app.Element().addChildTo(this);
      this.parameters.spec = {};

      var params = this.coreModel.parameters;
      Array.range(0, params.count).forEach(function(i) {
        var id = params.ids[i];
        var min = params.minimumValues[i];
        var max = params.maximumValues[i];
        this.parameters.spec[id] = {
          defaultValue: params.defaultValues[i],
          min: min,
          max: max,
        };
        this.parameters.accessor(id, {
          get: function() {
            return params.values[i];
          },
          set: function(v) {
            params.values[i] = Math.clamp(v, min, max);
          },
        });
      }.bind(this));
    },

    _initPhisics: function(options) {
      if (!options.physics) return;

      var physics = typeof(options.physics) === "string" ? AssetManager.get("live2d.physics", options.physics) : options.physics;

      var physicsRigBuilder = new LIVE2DCUBISMFRAMEWORK.PhysicsRigBuilder();
      physicsRigBuilder.setPhysics3Json(physics.data);
      this.physicsRig = physicsRigBuilder
        .setTarget(this.coreModel)
        .setTimeScale(options.timeScale)
        .build();
    },

    isPlaying: function(layerName) {
      layerName = layerName || "base";
      return this.animator
        .getLayer(layerName)
        .isPlaying;
    },

    play: function(motion, fadeDuration, layerName) {
      if (typeof(motion) === "string") {
        motion = phina.asset.AssetManager.get("live2d.motion", motion).data;
      }
      fadeDuration = fadeDuration || 0;
      layerName = layerName || "base";

      this.animator
        .getLayer(layerName)
        .play(motion, fadeDuration);
    },

    resume: function(layerName) {
      layerName = layerName || "base";
      return this.animator
        .getLayer(layerName)
        .resume();
    },

    pause: function(layerName) {
      layerName = layerName || "base";
      return this.animator
        .getLayer(layerName)
        .pause();
    },

    stop: function(layerName) {
      layerName = layerName || "base";
      return this.animator
        .getLayer(layerName)
        .stop();
    },

    getCurrentTime: function(layerName) {
      layerName = layerName || "base";
      return this.animator
        .getLayer(layerName)
        .currentTime;
    },

    setCurrentTime: function(layerName, time) {
      layerName = layerName || "base";
      this.animator
        .getLayer(layerName)
        .currentTime = time;
    },

    update: function(app) {
      this.animator.updateAndEvaluate(app.deltaTime * 0.001);
      if (this.physicsRig) {
        this.physicsRig.updateAndEvaluate(app.deltaTime * 0.001);
      }
      this.coreModel.update();

      var sort = false;
      var drawables = this.coreModel.drawables;
      for (var m = 0; m < this.meshes.length; ++m) {
        var mesh = this.meshes[m];
        mesh.opacity = drawables.opacities[m];
        mesh.visible = Utils.hasIsVisibleBit(drawables.dynamicFlags[m]);
        if (Utils.hasVertexPositionsDidChangeBit(drawables.dynamicFlags[m])) {
          mesh.vertexPositions = drawables.vertexPositions[m];
          mesh.dirtyVertex = true;
        }
        if (Utils.hasRenderOrderDidChangeBit(drawables.dynamicFlags[m])) {
          sort = true;
        }
      }

      if (sort) {
        this.orderedMeshes.sort(function(lhs, rhs) {
          return drawables.renderOrders[lhs.index] - drawables.renderOrders[rhs.index];
        });
      }

      // this._checkAnimationEnd();
    },

    _checkAnimationEnd: function() {
      for (var kv of this.animator._layers) {
        var name = kv[0];
        var layer = kv[1];
        if (layer.isPlaying && layer.currentTime >= layer._animation.duration) {
          layer.currentTime -= layer._animation.duration;
          this.flare("finishAnimation", {
            layer: name,
          });
        }
      }
    },

    drawWebGL: function(layer) {
      var gl = this.gl;

      for (var i = 0; i < this.orderedMeshes.length; ++i) {
        var mesh = this.orderedMeshes[i];
        if (mesh.dirtyVertex) {
          mesh.setAttributeDataArray([{
            unitSize: 2,
            data: mesh.vertexPositions,
          }, {
            unitSize: 2,
            data: mesh.uvs,
          }, ], gl.DYNAMIC_DRAW);

          mesh.dirtyVertex = false;
        }
        mesh.uniforms["visible"].setValue(mesh.visible ? 1 : 0);
        mesh.uniforms["texture"].setValue(0).setTexture(mesh.texture);
        mesh.uniforms["opacity"].setValue(mesh.opacity);

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

        if (mesh.doubleSided) {
          gl.disable(gl.CULL_FACE);
        } else {
          gl.enable(gl.CULL_FACE);
        }

        mesh.draw();
      }
    },

    setAlpha: function(v) {
      this._alpha = v;
      return this;
    },

    delete: function() {
      if(!this.textures) return ;
      //テクスチャの破棄
      this.textures.forEach(function(texture) {
        texture.delete();
      });
      //メッシュの破棄
      this.meshes.forEach(function(mesh) {
        mesh.delete();
      });
    },

    _accessor: {
      playing: {
        get: function() {
          return this.isPlaying();
        },
      },
      currentTime: {
        get: function() {
          return this.getCurrentTime();
        },
        set: function(v) {
          this.setCurrentTime(v);
        },
      },
      alpha: {
        get: function() {
          return this._alpha;
        },
        set: function(v) {
          this.setAlpha(v);
        },
      },
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

      _programCache: {},
      _vertexShaderCache: {},
      _fragmentShaderCache: {},

      getProgram: function(gl) {
        var id = phigl.GL.getId(gl);
        if (this._programCache[id] == null) {
          this._programCache[id] = phigl.Program(gl)
            .attach(this.getVertexShader(gl))
            .attach(this.getFragmentShader(gl))
            .link();
        }
        return this._programCache[id];
      },

      getVertexShader: function(gl) {
        var id = phigl.GL.getId(gl);
        if (this._vertexShaderCache[id] == null) {
          this._vertexShaderCache[id] = phigl.VertexShader();
          this._vertexShaderCache[id].data = [
            "attribute vec2 vertexPosition;",
            "attribute vec2 uv;",

            "uniform float visible;",

            "varying vec2 vUv;",

            "void main(void) {",
            "  vUv = uv;",
            "  if (visible < 0.5) {",
            "    gl_Position = vec4(0.0);",
            "  } else {",
            "    vec3 pos = vec3(vertexPosition, 1.0);",
            "    gl_Position = vec4(pos, 1.0);",
            "  }",
            "}",
          ].join("\n");
        }
        return this._vertexShaderCache[id];
      },

      getFragmentShader: function(gl) {
        var id = phigl.GL.getId(gl);
        if (this._fragmentShaderCache[id] == null) {
          this._fragmentShaderCache[id] = phigl.FragmentShader();
          this._fragmentShaderCache[id].data = [
            "precision mediump float;",

            "uniform sampler2D texture;",
            "uniform float opacity;",

            "varying vec2 vUv;",

            "void main(void) {",
            "  vec4 col = texture2D(texture, vUv) * vec4(1.0, 1.0, 1.0, opacity);",
            "  if (col.a == 0.0) discard;",
            "  gl_FragColor = col;",
            "}",
          ].join("\n");
        }
        return this._fragmentShaderCache[id];
      },
    },
  });

});
//# sourceMappingURL=phina.live2d.js.map
