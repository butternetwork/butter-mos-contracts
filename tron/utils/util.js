let fs = require("fs");
let path = require("path");

async function readFromFile() {
    let p = path.join(__dirname, "../deployments/deploy.json")
    let deploy;
    if (!fs.existsSync(p)) {
      deploy = {}
    } else{
      let rawdata = fs.readFileSync(p);
      deploy = JSON.parse(rawdata);
      if(!deploy){
        deploy = {}
      }
    }

    return deploy;
}

async function writeToFile(deploy){
    let p = path.join(__dirname, "../deployments/deploy.json")
    await folder("../deployments/");
    fs.writeFileSync(p, JSON.stringify(deploy, null, "\t"));
}

const folder = async (reaPath) => {
    const absPath = path.resolve(__dirname, reaPath);
    try {
      await fs.promises.stat(absPath);
    } catch (e) {
      // {recursive: true} 
      await fs.promises.mkdir(absPath, { recursive: true });
    }
}
module.exports = {
    writeToFile,
    readFromFile
}