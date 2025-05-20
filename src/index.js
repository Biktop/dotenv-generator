#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient();
const CHUNK_SIZE = 10;
  
const pos = process.argv.indexOf('--source', 2);
if (pos < 0 || (pos + 1) >= process.argv.length) {
  console.log('Incorrect command arguments. Should be --source <path>');
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

  const names = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    names.add(match[2]);
  }

  // Convert Set to Array and chunk it
  const namesArray = Array.from(names);
  const chunks = Array.from(
    { length: Math.ceil(namesArray.length / CHUNK_SIZE) },
    (_, i) => namesArray.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
  );

  const params = Object.assign({}, ...await Promise.all(chunks.map(chunk => getParameters(chunk))));
    const generated = content.replace(regex, (match, name, value) => 
    Object.prototype.hasOwnProperty.call(params, value) ? `${name}=${params[value]}` : match
  );

  const dst = path.resolve(process.cwd(), '.env');
  try {
    fs.writeFileSync(dst, `# Source ${source}. Generated at ${new Date().toISOString()}\n${generated}`);
    console.log(`Successfully generated .env file at ${dst}`);
  } catch (err) {
    throw new Error(`Failed to write .env file: ${err.message}`);
  }
}

async function getParameters(names) {
  if (names.length === 0) return {};

  const command = new GetParametersCommand({ Names: names, WithDecryption: true });
  const result = await ssmClient.send(command);
  
  if (result.InvalidParameters?.length) {
    throw new Error(`Invalid parameters: ${result.InvalidParameters.join(', ')}`);
  }

  return result.Parameters.reduce((obj, p) => {
    obj[p.Name] = p.Value;
    return obj;
  }, {});
}