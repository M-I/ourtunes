#!/usr/bin/env node

require('default-debug')('build,error');

var command = require("new-command")();
var debug = require("debug")('build');
var error = require('debug')('error');
var browserify = require("browserify");
var path = require("path");
var fs = require("fs");
var mkdirp = require("mkdirp");
var yaml = require("js-yaml").load;
var format = require("new-format");
var stylus = require("stylus");
var templates = require("../lib/templates");

build(command._[0]);

function build (filename) {
  var name = path.basename(filename, '.yaml');
  var dir = path.dirname(filename);
  var doc = read(filename);

  if (!doc) return;

  mkdirp.sync(path.join(dir, name));

  writeHTML(name, dir, doc);
  writeCSS(name, dir);
  writeJS(name, dir, doc);
  writeJSON(name, dir, doc);
}

function read (filename) {
  if (!fs.existsSync(filename)) {
    error('Ooops, %s doesn\'t exist', filename);
    return;
  }

  if (fs.lstatSync(filename).isDirectory()) {
    error('Ooops, %s is a directory, not a YAML document.', filename);
    return;
  }

  var unparsed = fs.readFileSync(filename).toString().split('\n');
  var title, image;

  var i = -1;
  var len = unparsed.length;
  while (++i < len) {
    if (!/(title|image|soundcloud|screenshot|description)\:/.test(unparsed[i])) break;
  }

  var headers = yaml(unparsed.slice(0, i).join('\n'));
  var songs = yaml(unparsed.slice(i).join('\n'));

  return {
    title: headers.title,
    image: headers.image,
    description: headers.description,
    screenshot: headers.screenshot,
    songs: songs
  };
}

function writeHTML (name, dir, doc) {
  var html = format(templates['index.html'], {
    name: name,
    title: doc.title,
    image: doc.image,
    meta: generateMetaTags(doc),
    header: templates['header.html'],
    playlist: generatePlaylist(doc)
  });

  var target = path.join(dir, name, '/index.html');

  debug('Writing %s', target);
  fs.writeFileSync(target, html);
}

function writeJSON (name, dir, doc) {
  var target = path.join(dir, name, '/api.json');
  debug('Writing %s', target);
  fs.writeFileSync(target, JSON.stringify(doc, null, '\t'));
}

function writeCSS (name, dir) {
  var source = path.join(__dirname, '../player.styl');
  var target = path.join(dir, name, '/' + name + '.css');

  debug('Converting %s', source);

  var styl = fs.readFileSync(source).toString();

  stylus(styl).render(function (err, css) {
    if (err) return error(err);
    debug('Writing %s', target);
    fs.writeFileSync(target, css);
  });
}

function writeJS (name, dir, doc) {
  var entry = writeEntry(name, dir, doc);
  var target = path.join(dir, name, '/' + name + '.js');

  debug('Writing %s', target);

  var build = browserify();
  build._builtins['ourtunes'] = require.resolve('../index');

  var bundle = build.add('./' + entry).bundle();
  bundle.pipe(fs.createWriteStream(target));
  bundle.on('end', function () {
    fs.unlinkSync(entry);
  });
}

function writeEntry (name, dir, doc) {
  var target = path.join(dir, name,  '/_entry.js');
  var js = format(templates['entry.js'], {
    options: JSON.stringify({ soundcloud: doc.soundcloud })
  });

  debug('Writing %s temporarily.', target);
  fs.writeFileSync(target, js);

  return target;
}

function generateMetaTags (doc) {
  var tags = [
    '<meta property="og:title" content="' + doc.title + '" />',
    '<meta property="og:image" content="' + (doc.screenshot || doc.image) + '" />',
    '<link rel="image_src" type="image/jpg" href="' + (doc.screenshot || doc.image) + '" />'
  ];

  return tags.join('\n ');
}

function generatePlaylist (doc) {
  var songs = [];

  var name;
  for (name in doc.songs) {
    songs.push(format(templates['song.html'], {
      title: name,
      url: doc.songs[name]
    }));
  }

  return format(templates['playlist.html'], {
    songs: songs.join('\n')
  });
}
