#!/usr/bin/env node
/* Builds dist/<id>_<version>_all.ipk and the matching webosbrew manifest.
 * Requires @webos-tools/cli (ares-package) on PATH.  Usage: node build.js */
'use strict';
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO = 'https://github.com/swenz/boot-input-switcher';
const appinfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'appinfo.json'), 'utf8'));
const dist = path.join(__dirname, 'dist');
const ipkName = `${appinfo.id}_${appinfo.version}_all.ipk`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
execSync('ares-package app -o dist', { cwd: __dirname, stdio: 'inherit' });

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, ipkName))).digest('hex');

const manifest = {
  id: appinfo.id,
  version: appinfo.version,
  type: appinfo.type,
  title: appinfo.title,
  appDescription: appinfo.appDescription,
  iconUri: 'https://raw.githubusercontent.com/swenz/boot-input-switcher/main/app/largeIcon.png',
  sourceUrl: REPO,
  rootRequired: true,
  ipkUrl: ipkName,
  ipkHash: { sha256 },
};

const manifestName = `${appinfo.id}.manifest.json`;
fs.writeFileSync(path.join(dist, manifestName), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${ipkName}\nsha256 ${sha256}\n${manifestName}`);
