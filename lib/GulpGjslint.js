/*
 * gulp-gjslint
 */

'use strict';

var GulpGjslint;
var gjslint = require('closure-linter-wrapper').gjslint;
var merge = require('merge');
var through = require('through2');
var errorFactory = require('./util/error-factory');

/**
 * @param {Object=} options
 * @constructor
 */
GulpGjslint = function(options)
{
  // Set options to empty object if none were specified
  options = options || {};

  /**
   * Merge options with the default options.
   *
   * @type {*|exports}
   */
  this.options = merge({}, GulpGjslint.DEFAULT_OPTIONS, options);

  // Force reporter to be null as reporting is handled separately
  this.options.lintOptions.reporter = GulpGjslint.DEFAULT_OPTIONS.lintOptions.reporter;

  /**
   * Initialise stream property.
   *
   * @type {null}
   */
  this.stream = null;

  /**
   * @type {Function}
   */
  this.createError = new errorFactory(GulpGjslint.PLUGIN_NAME);

  /**
   * @type {Object.<String, File>}
   */
  this.files = Object.create(null);
};

/**
 * @type {string}
 */
GulpGjslint.PLUGIN_NAME = 'gulp-gjslint';

/**
 * @type {Object}
 */
GulpGjslint.DEFAULT_OPTIONS = {
  passOnlyError: false,
  lintOptions: {
    reporter: null
  }
};

/**
 * @type {*}
 */
GulpGjslint.reporter = require(__dirname + '/reporters');


/**
 * Adds linting result data to a File object.
 *
 * This data can be used by a reporter after the stream
 * has finished.
 *
 * @param {File} file
 * @param {Object=} fail
 * @return {File}
 */
GulpGjslint.prototype.parseResults = function(file, fail)
{
  file.gjslint = merge({success: !fail || !fail.errors || fail.errors.length === 0}, { results: fail });

  return file;
};

/**
 * @param {File} file
 * @param {String} encoding
 * @param {Function} callback
 */
GulpGjslint.prototype.processFile = function(file, encoding, callback)
{

  if (file.isStream()) {
    this.stream.emit(
      'error',
      this.createError('Streaming is not supported')
    );

    return callback();
  }

  this.files[file.path] = file;
  callback && callback();
};

/**
 * @param {Function} callback
 * @return {Function=}
 */
GulpGjslint.prototype.endStream = function(callback)
{
  this.loadSource(Object.keys(this.files), callback);
};

/**
 * @param {String|Array.<String>} src
 * @param {Function} callback
 */
GulpGjslint.prototype.loadSource = function(src, callback)
{
  // Get copy of options, so that any modifications
  // will be for this file only.
  var options = merge({}, this.options.lintOptions);

  options.src = !Array.isArray(src) ? [src] : src;

  gjslint(options, function(err) {
    // Check gjslint didn't blow up
    if (err && (err.code !== 0 && err.code !== 2)) {
      /*
       Exit codes:
       0: Linting success
       1: Python not found
       2: Linting failed
       3: Parsing failed
       4: gjslint exception
       */

      var errorMessage = 'gjslint crashed whilst parsing: ' + file.path +
        '\nReason: ' + err.description +
        '\n\n' + err.info;

      this.stream.emit('error', this.createError(errorMessage));
    }

    var errorFiles = [];
    if (err) {
      err.info.fails.forEach(function(fail){
        errorFiles.push(fail.file);
        this.stream.push(this.parseResults(this.files[fail.file], fail));
      }, this);
    }

    if (!this.options.passOnlyError) {
      for (var filePath in this.files) {
        if (errorFiles.indexOf(this.files[filePath].path)===-1) {
          this.stream.push(this.files[filePath]);
        }
      }
    }

    // Store result data on the file object
    //file = this.parseResults(file, err);

    //this.stream.push(file);

    callback();
  }.bind(this));

  return null;
};

/**
 * @return {Stream=}
 */
GulpGjslint.prototype.run = function()
{
  this.stream = through.obj(this.processFile.bind(this), this.endStream.bind(this));

  return this.stream;
};

/**
 * @type {GulpGjslint}
 */
module.exports = GulpGjslint;
