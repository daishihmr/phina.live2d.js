const gulp = require("gulp");
const concat = require("gulp-concat");
const watch = require("gulp-watch");
const sourcemaps = require("gulp-sourcemaps");
const removeLogging = require("gulp-remove-logging");
const uglify = require("gulp-uglify-es").default;
const rename = require("gulp-rename");

gulp.task("concat", () => {
  gulp.src("src/**/*.js")
    .pipe(sourcemaps.init())
    .pipe(concat("phina.live2d.js"))
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest("./build"));
});

gulp.task("uglify", function() {
  gulp.src("./build/phina.live2d.js")
    .pipe(uglify())
    .pipe(removeLogging())
    .pipe(rename({
      extname: ".min.js"
    }))
    .pipe(gulp.dest("./build"));
});

gulp.task("watch", () => gulp.watch("src/**/*.js", ["concat"]));

gulp.task("default", ["concat", "uglify"]);