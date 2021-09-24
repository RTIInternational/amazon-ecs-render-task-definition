const core = require('@actions/core');
const dotenv = require('dotenv')
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');

// Reads the env file and transforms it to array of JSON objects
function transformEnv(envPath) {
  const result = dotenv.config({ path: envPath })
  if (result.error) {
    throw result.error
  }
  const env = result.parsed
  let output = []
  for (const key in env) {
      output.push({
          "name": key,
          "value": env[key]
      })
  }
}

// Validates input filepaths and returns them
function validateInput(envInputFilepath, taskdefInputFilepath) {
  const envPath = path.isAbsolute(envInputFilepath) ?
      envInputFilepath :
      path.join(process.env.GITHUB_WORKSPACE, envInputFilepath);
  if (!fs.existsSync(envPath)) {
      throw new Error(`Env file does not exist: ${envPath}`);
  }
  const taskDefPath = path.isAbsolute(taskdefInputFilepath) ?
  taskdefInputFilepath :
    path.join(process.env.GITHUB_WORKSPACE, taskdefInputFilepath);
  if (!fs.existsSync(taskDefPath)) {
    throw new Error(`Task definition file does not exist: ${taskDefPath}`);
  }
  return {envPath, taskDefPath}
}

async function run() {
  try {
    const containerName = core.getInput('container-name', { required: true });
    const envInputFilepath = core.getInput('env-file', { required: true });
    const taskdefInputFilepath = core.getInput('task-definition', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const { envPath, taskDefPath } = validateInput(envInputFilepath, taskdefInputFilepath)

    const newEnv = transformEnv(envPath)
    const taskDefContents = require(taskDefPath);

    // Insert the image URI and environment variables
    if (!Array.isArray(taskDefContents.containerDefinitions)) {
      throw new Error('Invalid task definition format: containerDefinitions section is not present or is not an array');
    }
    const containerDef = taskDefContents.containerDefinitions.find(function(element) {
      return element.name == containerName;
    });
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }
    containerDef.environment = newEnv;
    containerDef.image = imageURI;

    // Write out a new task definition file
    var updatedTaskDefFile = tmp.fileSync({
      tmpdir: process.env.RUNNER_TEMP,
      prefix: 'task-definition-',
      postfix: '.json',
      keep: true,
      discardDescriptor: true
    });
    const newTaskDefContents = JSON.stringify(taskDefContents, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newTaskDefContents);
    core.setOutput('task-definition', updatedTaskDefFile.name);
  } catch (error) {
    core.setFailed(error.message);
  }
}


module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
