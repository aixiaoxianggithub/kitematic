var gulp = require('gulp');
var source = require('vinyl-source-stream'); // Used to stream bundle for further handling
var browserify = require('browserify');
var watchify = require('watchify');
var reactify = require('reactify');
var gulpif = require('gulp-if');
var uglify = require('gulp-uglifyjs');
var notify = require('gulp-notify');
var concat = require('gulp-concat');
var less = require('gulp-less');
var livereload = require('gulp-livereload');
var cssmin = require('gulp-cssmin');
var imagemin = require('gulp-imagemin');
var gutil = require('gulp-util');
var shell = require('gulp-shell');
var plumber = require('gulp-plumber');
var sourcemaps = require('gulp-sourcemaps');
var glob = require('glob');
var runSequence = require('run-sequence');
var ecstatic = require('ecstatic');
var downloadatomshell = require('gulp-download-atom-shell');
var packagejson = require('./package.json');
var http = require('http');
var react = require('gulp-react');
var fs = require('fs');

var dependencies = Object.keys(packagejson.dependencies);
var devDependencies = Object.keys(packagejson.devDependencies);
var options = {
  dev: process.argv.indexOf('release') === -1 && process.argv.indexOf('test') === -1,
  test: process.argv.indexOf('test') !== -1,
  filename: 'Kitematic.app',
  name: 'Kitematic'
  //signing_identity: fs.readFileSync('./identity')
};

gulp.task('js', function () {
  gulp.src('./app/**/*.js')
    .pipe(plumber(function(error) {
      gutil.log(gutil.colors.red('Error (' + error.plugin + '): ' + error.message));
      // emit the end event, to properly end the task
      this.emit('end');
    }))
    .pipe(react())
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.filename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('specs', function () {
  var bundler = browserify({
    entries: glob.sync('./specs/**/*-spec.js'),
    debug: true, // Gives us sourcemapping
    transform: [reactify],
    cache: {}, packageCache: {}, fullPaths: true // Requirement of watchify
  });

  dependencies.forEach(function (dep) {
    bundler.external(dep);
  });

  devDependencies.forEach(function (dep) {
    bundler.external(dep);
  });

  bundler.external('./app');

  bundler.bundle()
    .on('error', gutil.log)
    .pipe(source('specs.js'))
    .pipe(gulp.dest('./build'));

  gulp.src('./specs/specs.html')
    .pipe(gulp.dest('./build'));
});

gulp.task('images', function() {
  return gulp.src('./app/images/*')
    .pipe(imagemin({
      progressive: true,
      interlaced: true,
      svgoPlugins: [{removeViewBox: false}]
    }))
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.filename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('styles', function () {
  return gulp.src('app/styles/main.less')
    .pipe(plumber(function(error) {
      gutil.log(gutil.colors.red('Error (' + error.plugin + '): ' + error.message));
      // emit the end event, to properly end the task
      this.emit('end');
    }))
    .pipe(gulpif(options.dev, sourcemaps.init()))
    .pipe(less())
    .pipe(gulpif(options.dev, sourcemaps.write()))
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.filename + '/Contents/Resources/app/build'))
    .pipe(gulpif(!options.dev, cssmin()))
    .pipe(concat('main.css'))
    .pipe(gulpif(options.dev && !options.test, livereload()));
});

gulp.task('download', function (cb) {
  downloadatomshell({
    version: packagejson['atom-shell-version'],
    outputDir: 'cache'
  }, cb);
});

gulp.task('copy', function () {
  gulp.src('./app/index.html')
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.filename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));

  gulp.src('./app/fonts/**')
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.filename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('dist', function (cb) {
  var stream = gulp.src('').pipe(shell([
    'rm -Rf ./dist',
    'mkdir -p ./dist/osx',
    'cp -R ./cache/Atom.app ./dist/osx/<%= filename %>',
    'mv ./dist/osx/<%= filename %>/Contents/MacOS/Atom ./dist/osx/<%= filename %>/Contents/MacOS/<%= name %>',
    'mkdir -p ./dist/osx/<%= filename %>/Contents/Resources/app',
    'cp -R browser dist/osx/<%= filename %>/Contents/Resources/app',
    'cp package.json dist/osx/<%= filename %>/Contents/Resources/app/',
    'mkdir -p dist/osx/<%= filename %>/Contents/Resources/app/resources',
    'cp -v resources/* dist/osx/<%= filename %>/Contents/Resources/app/resources/ || :',
    'cp kitematic.icns dist/osx/<%= filename %>/Contents/Resources/atom.icns',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleVersion <%= version %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName <%= name %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleName <%= name %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier <%= bundle %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable <%= name %>" dist/osx/<%= filename %>/Contents/Info.plist'
    ], {
      templateData: {
        filename: options.filename,
        name: options.name,
        version: packagejson.version,
        bundle: 'com.kitematic.app'
      }
  }));

  dependencies.forEach(function (d) {
    stream = stream.pipe(shell([
      'cp -R node_modules/' + d + ' dist/osx/<%= filename %>/Contents/Resources/app/node_modules/'
    ], {
      templateData: {
        filename: options.filename
      }
    }));
  });

  return stream;
});

gulp.task('sign', function () {
  return gulp.src('').pipe(shell([
    'codesign --deep --force --verbose --sign "' + options.signing_identity + '" ' + options.filename
  ], {
    cwd: './dist/osx/'
  }));
});

gulp.task('zip', function () {
  return gulp.src('').pipe(shell([
    'ditto -c -k --sequesterRsrc --keepParent ' + options.filename + ' ' + options.name + '-' + packagejson.version + '.zip'
  ], {
    cwd: './dist/osx/'
  }));
});

gulp.task('release', function () {
  runSequence('download', 'dist', ['copy', 'images', 'js', 'styles'], 'sign', 'zip');
});

gulp.task('test', ['download', 'copy', 'js', 'images', 'styles', 'specs'], function () {
  var env = process.env;
  env.NODE_ENV = 'development';
  gulp.src('').pipe(shell(['./cache/Atom.app/Contents/MacOS/Atom . --test'], {
    env: env
  }));
});

gulp.task('default', ['download', 'copy', 'js', 'images', 'styles'], function () {
  gulp.watch('./app/**/*.js', ['js']);
  gulp.watch('./app/**/*.html', ['copy']);
  gulp.watch('./app/styles/**/*.less', ['styles']);
  gulp.watch('./app/images/**', ['images']);

  livereload.listen();

  var env = process.env;
  env.NODE_ENV = 'development';
  gulp.src('').pipe(shell(['./cache/Atom.app/Contents/MacOS/Atom .'], {
    env: env
  }));
});