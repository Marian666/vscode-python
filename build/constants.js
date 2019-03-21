// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("./util");
exports.ExtensionRootDir = util.ExtensionRootDir;
// This is a list of files that existed before MS got the extension.
exports.existingFiles = util.getListOfFiles('existingFiles.json');
exports.contributedFiles = util.getListOfFiles('contributedFiles.json');
exports.isCI = process.env.TRAVIS === 'true' || process.env.TF_BUILD !== undefined;
