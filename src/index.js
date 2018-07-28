#!/usr/bin/env node

import fs, { access } from 'fs';
import path from 'path';
import AWS from 'aws-sdk';

const pos = process.argv.indexOf('--source', 2);
if (pos < 0 || (pos + 1) >= process.argv.length) {
  console.log('Incorrect commmand arguments. Should be --source <path>');
  process.exit(1);
}

generateEnv(process.argv[pos + 1]).catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function generateEnv(source) {
  const regex = /^(?!#)(.+)={(.+)}$/mgi;

  console.log(`Generating .env from ${source}`);

  const src = path.resolve(process.cwd(), source);
  const content = fs.readFileSync(src).toString();

  const names = [];

  let match = null;
  while ((match = regex.exec(content)) !== null) {
    names.push(match[2]);
  }

  // Retrive parameters by 10 elements due to AWS limitation
  const chunks = [];
  for (let i = 0; i < names.length; i = i + 10) {
    chunks.push(names.slice(i, i + 10));
  }

  const result = await Promise.all(chunks.map(i => getParameters(i)));
  const params = result.reduce((a, v) => Object.assign(a, v), {});

  const generated = content.replace(regex, (match, name, value) => params[value] ? `${name}=${params[value]}` : match);

  const dst = path.resolve(process.cwd(), '.env');
  fs.writeFileSync(dst, `# Source ${source}. Generated at ${new Date().toISOString()}\n${generated}`);
}

async function getParameters(names) {
  if (names.length < 1) { return [] }

  const ssm = new AWS.SSM();
  const result = await ssm.getParameters({ Names: names, WithDecryption: true }).promise();
  if (result.InvalidParameters.length) {
    throw new Error(`Invalid parameters: ${result.InvalidParameters.join(', ')}`);
  }
  return result.Parameters.reduce((obj, p) => (obj[p.Name] = p.Value, obj), {});
}