const { src, dest, watch, series, parallel } = require('gulp');
const plugin = require('gulp-load-plugins')({
  rename: {
    'gulp-clean-css': 'cleanCSS',
    'gulp-svg-sprite': 'spriteSVG',
    'gulp-group-css-media-queries': 'gcmq',
    'gulp-html-prettify': 'prettify',
  },
});

const imageminJR = require('imagemin-jpeg-recompress');
const pngquant = require('imagemin-pngquant');
const merge2 = require('merge2');
const del = require('del');
const browserSync = require('browser-sync').create();

const webpack = require('webpack');
const stream = require('webpack-stream');
const TerserJSPlugin = require('terser-webpack-plugin');

const dev = plugin.environments.development;
const prod = plugin.environments.production;

const onError = err => {
  plugin.notify.onError({
    title: `Error in ${err.plugin}`,
    message: '<%= error.message %>',
    sound: 'Pop',
    onLast: true,
  })(err);
  this.emit('end');
};

const path = {
  src: {
    root: 'src/',
    styles: 'src/styles/',
    js: 'src/js/',
    img: 'src/img/',
    fonts: 'src/fonts/',
  },
  assets: 'dist/assets/',
  dist: 'dist/',
};

/* ===============   webpackConfig  =============== */

const webpackConfig = {
  mode: dev() ? 'development' : 'production',
  output: {
    filename: `[name].js`,
  },
  devtool: dev() ? 'eval-source-map' : 'none',
  optimization: {
    minimizer: [new TerserJSPlugin({})],
    splitChunks: {
      chunks: 'all',
    },
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  plugins: [
    new webpack.SourceMapDevToolPlugin({
      filename: '[file].map',
    }),
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery',
      'window.jQuery': 'jquery',
    }),
  ],
  resolve: {
    modules: ['node_modules'],
  },
};

/* ===================   serve  =================== */

function serve() {
  browserSync.init({
    server: path.dist,
    // tunnel: "project",
  });
}

/* =====================  html  ==================== */

function html() {
  return src(`${path.src.root}*.html`)
    .pipe(
      plugin.include({
        includePaths: [`${__dirname}/src/blocks`, `${__dirname}/src/img`],
      })
    )
    .pipe(dest(path.dist))
    .pipe(browserSync.reload({ stream: true }));
}

/* ====================  scss  ==================== */

function styles() {
  return src(`${path.src.styles}*.{scss, sass}`)
    .pipe(dev(plugin.sourcemaps.init()))
    .pipe(
      plugin.plumber({
        errorHandler: onError,
      })
    )
    .pipe(
      plugin.sass({
        outputStyle: 'expanded',
      })
    )
    .pipe(plugin.autoprefixer())
    .pipe(plugin.gcmq())
    .pipe(
      prod(
        plugin.cleanCSS(
          {
            level: 2,
            debug: true,
          },
          details => {
            console.log(`${details.name}: ${details.stats.originalSize}`);
            console.log(`${details.name}: ${details.stats.minifiedSize}`);
          }
        )
      )
    )
    .pipe(dev(plugin.sourcemaps.write('.')))
    .pipe(dest(`${path.assets}css`))
    .pipe(browserSync.stream());
}

/* =====================  js  ===================== */

function js() {
  return src(`${path.src.js}main.js`)
    .pipe(
      plugin.plumber({
        errorHandler: onError,
      })
    )
    .pipe(stream(webpackConfig))
    .pipe(dest(`${path.assets}js`))
    .pipe(browserSync.reload({ stream: true }));
}

/* =====================  png  ==================== */

function spritePng() {
  const spriteData = src(`${path.src.img}png/*.png`).pipe(
    plugin.spritesmith({
      imgName: 'sprite.png',
      cssName: '_spritePng.scss',
      cssFormat: 'scss',
      algorithm: 'binary-tree',
      padding: 4,
      cssTemplate: `${path.src.styles}utils/spritePng.template.scss`,
    })
  );
  const imgStream = spriteData.img.pipe(dest(path.src.img));
  const cssStream = spriteData.css.pipe(dest(`${path.src.styles}tmp/`));
  return merge2(imgStream, cssStream);
}

/* =====================  svg  ==================== */

function spriteSvg() {
  return (
    src(`${path.src.img}svg/*.svg`)
      .pipe(
        plugin.plumber({
          errorHandler: onError,
        })
      )
      .pipe(
        plugin.svgmin({
          js2svg: {
            pretty: true,
          },
        })
      )
      // .pipe(
      //   plugin.cheerio({
      //     run: $ => {
      //       $('[fill]').removeAttr('fill');
      //       $('[stroke]').removeAttr('stroke');
      //       $('[style]').removeAttr('style');
      //     },
      //     parserOptions: {
      //       xmlMode: true,
      //     },
      //   })
      // )
      .pipe(plugin.replace('&gt;', '>'))
      .pipe(
        plugin.spriteSVG({
          mode: {
            symbol: {
              dest: './',
              sprite: 'spriteSvg.svg',
              render: {
                scss: {
                  dest: '../styles/tmp/_spriteSvg.scss',
                  template: `${path.src.styles}utils/spriteSvg.template.scss`,
                },
              },
              svg: {
                xmlDeclaration: false,
                doctypeDeclaration: false,
                rootAttributes: {
                  style: 'display:none;',
                  'aria-hidden': 'true',
                },
              },
            },
          },
        })
      )
      .pipe(dest(path.src.img))
  );
}

/* ===================  images  =================== */

function img() {
  return src([`${path.src.img}**/*.*`, `!${path.src.img}{png,svg}/*.*`])
    .pipe(
      prod(
        plugin.cache(
          plugin.imagemin(
            [
              plugin.imagemin.gifsicle({
                interlaced: true,
              }),
              plugin.imagemin.jpegtran({
                progressive: true,
              }),
              imageminJR({
                loops: 5,
                min: 65,
                max: 70,
                quality: 'medium',
              }),
              plugin.imagemin.svgo(),
              plugin.imagemin.optipng({
                optimizationLevel: 3,
              }),
              pngquant({
                quality: [0.65, 0.7],
                speed: 5,
              }),
            ],
            {
              verbose: true,
            }
          )
        )
      )
    )
    .pipe(dest(`${path.assets}img`));
}

/* ===================  fontgen  ================== */

function fontgen() {
  return src(`${path.src.fonts}**/*.ttf`)
    .pipe(plugin.fontmin())
    .pipe(plugin.ttf2woff2())
    .pipe(dest(path.src.fonts));
}

/* ====================  fonts  =================== */

function fonts() {
  return src(`${path.src.fonts}**/*.{svg,eot,ttf,woff,woff2}`).pipe(
    dest(`${path.assets}fonts`)
  );
}

/* ====================  watch  =================== */

function watchFiles() {
  watch(`${path.src.root}**/*.html`, html);
  watch(path.src.styles, styles);
  watch(path.src.js, js);
  watch(path.src.img, img);
  watch(`${path.src.img}png/*.png`, spritePng);
  watch(`${path.src.img}svg/*.svg`, spriteSvg);
}

/* ====================  clean  =================== */

function clean() {
  plugin.cache.clearAll();
  return del([
    path.dist,
    `${path.src.fonts}**/*.css`,
    `${path.src.scss}tmp`,
    `${path.src.img}spriteSvg.svg`,
    `${path.src.img}sprite.png`,
  ]).then(dir => {
    console.log('Deleted files and folders:\n', dir.join('\n'));
  });
}

/* ===================  exports  ================== */

exports.html = html;
exports.styles = styles;
exports.js = js;
exports.img = img;
exports.spritePng = spritePng;
exports.spriteSvg = spriteSvg;
exports.fontgen = fontgen;
exports.fonts = fonts;
exports.clean = clean;
exports.watch = watchFiles;

/* ====================  dev  ===================== */

exports.default = series(
  clean,
  // spritePng,
  // spriteSvg,
  parallel(html, styles, js, img, fonts),
  parallel(watchFiles, serve)
);

/* ===================  build  ==================== */

exports.build = series(
  clean,
  // spritePng,
  // spriteSvg,
  parallel(html, styles, js, img, fonts)
);
