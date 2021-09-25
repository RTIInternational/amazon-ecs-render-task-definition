const core = require('@actions/core');
const dotenv = require('dotenv')
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');

// Reads each envFilePath and merges its contents into 1 object
function mergeEnvFiles(envFilePaths) {
  let merged = {}
  envFilePaths.forEach(fpath => {
    const result = dotenv.config({ path: fpath })
    if (result.error) {
      throw result.error
    }
    Object.assign(merged, result.parsed)
  })
  return merged
}

// Transforms env hashmap to an array of JSON objects
function transformEnv(envFilePaths) {
  const env = mergeEnvFiles(envFilePaths)
  let output = []
  for (const key in env) {
      output.push({
          "name": key,
          "value": env[key]
      })
  }
  return output
}

// Validates input filepaths and returns them
// envInputFilepaths is a string; we parse to JSON and its validate filepaths
function validateInput(envInputFilepaths, taskdefInputFilepath) {
  let envFilePaths = []
  const pathArray = JSON.parse(envInputFilepaths)
  if(!Array.isArray(pathArray)) {
    throw Error("`env-files` is not a valid JavaScript array")
  }
  pathArray.forEach(envInputFilepath => {
    const envPath = path.isAbsolute(envInputFilepath) ?
        envInputFilepath :
        path.join(process.env.GITHUB_WORKSPACE, envInputFilepath);
    if (!fs.existsSync(envPath)) {
        throw new Error(`Env file does not exist: ${envPath}`);
    }
    envFilePaths.push(envPath)
  })
  const taskDefPath = path.isAbsolute(taskdefInputFilepath) ?
  taskdefInputFilepath :
    path.join(process.env.GITHUB_WORKSPACE, taskdefInputFilepath);
  if (!fs.existsSync(taskDefPath)) {
    throw new Error(`Task definition file does not exist: ${taskDefPath}`);
  }
  return {envFilePaths, taskDefPath}
}

async function run() {
  try {
    const containerName = core.getInput('container-name', { required: true });
    const envFilesInput = core.getInput('env-files', { required: true });
    const taskdefInput = core.getInput('task-definition', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const { envFilePaths, taskDefPath } = validateInput(envFilesInput, taskdefInput)

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
    containerDef.environment = transformEnv(envFilePaths);
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
