
/* http server is created, which listens for requests via port 8000 using CORS headers. 
If request method is OPTIONS, then response is returned w/o body. Otherwise, corresponding 
handler func. of request method is obtained, which is then used to catch and handle 
encountered errors (if it contains a promise), and populate response properties accordingly, 
including piping response stream to response body if applicable. 
*/

const { exec } = require("child_process");
const os = require("os");

/*
const open = require("open");
const http = require("http");
*/

//”createServer” func. imported from “http” module
const {createServer} = require("http");

//”methods” obj. initialized as empty object
const methods = Object.create(null);

//server is created w/ response object that listens for requests via port 8000
createServer((request, response) => {

     //CORS headers are set, allowing all domains to make server requests
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');

    //checks if request method is OPTIONS
    if (request.method === 'OPTIONS') {

         //if condition is met, then response is ended w/o body
        return response.end();

    }

    /* obtains corresponding handler func. for http method 
    (if none found, default for handling unsupported methods is used */
    let handler = methods[request.method] || notAllowed;

    //obtained handler func. is called via request obj.
    handler(request)
        //if handler returns promise, then it will catch and handle any errors encountered
        .catch(error => {
            //if the error has a status code other than null, then return it
            if (error.status != null) return error;
                //otherwise, return the given obj. w/ the error as a string and status code 500
                return {body: String(error), status: 500};
        })
        //set body, status, and type via “then” block
        .then(({body, status = 200, type = "text/plain"}) => {
            //write the given status value and content type to response obj.
            response.writeHead(status, {"Content-Type": type});
            //if response body is a stream, then stream is piped to response obj.
            if (body && body.pipe) body.pipe(response);
            //otherwise, response body is returned as plain text
            else response.end(body);
        });
//server listens for requests via port 8000
}).listen(8000, () => {
    console.log("Server running at http://localhost:8000");
    openBrowser("http://localhost:8000"); // <-- This opens the default browser
});


/*
server.listen(8000, async () => {
    console.log("Server running at http://localhost:8000");
    await open("http://localhost:8000", { wait: true });
    console.log("Browser closed. Exiting.");
    server.close(() => process.exit(0));
  });
*/


//asynchronous func. defined w/ request object, which implements default handler func.
async function notAllowed(request) {
    //return 405 as status code, and unallowed http method as body content
    return {
        status: 405,
        body: `Method ${request.method} not allowed.`
    };
}


// GET helper function urlPath:

//get parse func. from “url” module to parse URLs
const {parse} = require("url");
//get resolve and sep func. from "path" module, to securely handle paths
const {resolve, sep} = require("path");
//get current working directory as root

//const baseDirectory = process.cwd();

const path = require("path");
const baseDirectory = path.dirname(process.execPath);

//define urlPath func., which uses built-in Node url module to parse URLs
function urlPath(url) {
    let { pathname } = parse(url);

    if (pathname === "/") pathname = "/index.html";

   
    const decodedPath = decodeURIComponent(pathname).slice(1);

    
    const fullPath = path.resolve(baseDirectory, decodedPath);

   
    if (!fullPath.startsWith(baseDirectory + sep)) {
        throw { status: 403, body: "Forbidden" };
    }

    return fullPath;
}


// GET method

//get createReadStream func. from “fs” module
const {createReadStream} = require("fs");
//get stat and readdir func. from "fs" module
const {stat, readdir} = require("fs").promises;
//mime library used to obtain correct MIME type for given file
const mime = require("mime");

//GET method defined as async func. that returns list of files when reading directory, and file content when reading regular file
methods.GET = async function(request) {
    //obtains full resolved path via request url
    let path = urlPath(request.url);
    //declare stats var.
    let stats;
    //check if path exists
    try {
        stats = await stat(path);
    //if file does not exist, throw error
    } catch (error) {
        //if diff. error code produced, throw it
        if (error.code != "ENOENT") throw error;
        //otherwise if error obj. of ENOENT code produced, return 404 error
        else return {status: 404, body: "File not found"};
    }
    //check if file is a directory
    if (stats.isDirectory()) {
        //if so, read array of files in directory and return it to client
        return {body: (await readdir(path)).join("\n")};
    } else {
        //otherwise, create readable stream, and return stream and file MIME type
        return {body: createReadStream(path),
            type: mime.getType(path)};
    }
};


// DELETE method

//get rmdir and unlink func. from "fs" module
const {rmdir, unlink} = require("fs").promises;

//DELETE method defined as async. func., which removes a directory or file
methods.DELETE = async function(request) {
    //translate the url into a file name
    let path = urlPath(request.url);
    //invoke stat object called stats
    let stats;
    //wait for stat to find the file
    try {
        stats = await stat(path);
    //handle a non-existent file name
    } catch (error) {
        //if diff. error code produced, throw it
        if (error.code != "ENOENT") throw error;
        //otherwise if error obj. of ENOENT code produced, return 204 status
        else return {status: 204};
    }
    //if the file name is a directory, remove it
    if (stats.isDirectory()) await rmdir(path);
    //if the file name is not a directory, remove it as a file
    else await unlink(path);
    //report that the file deletion was successful
    return {status: 204};
};


// PUT helper function pipeStream

//get createWriteStream func. from "fs" module
const {createWriteStream} = require("fs");

//define pipeStream func., which copies request body to file using streams
function pipeStream(from, to) {
    //create promise around outcome of calling pipe, so as to move data (from request to file) from readable stream to writable stream
    return new Promise((resolve, reject) => {
        //returned promise resolves when write is finished or rejects on error
        from.on("error", reject);
        to.on("error", reject);
        to.on("finish", resolve);

        //pipes data between streams
        from.pipe(to);
    });
}


// PUT method

//PUT method defined, which writes to a file
methods.PUT = async function(request) {
    //translate the url into a file name
    let path = urlPath(request.url);
    
    await pipeStream(request, createWriteStream(path));
    //report successful write operation 
    return {status: 204};
};


// MKCOL method

//NOTE: chatgpt.com used to aid in defining MKCOL method, and determining error codes to look for

//get mkdir func. from "fs" module to create new directory
const {mkdir} = require("fs").promises;

//MKCOL method defined, which makes a directory
methods.MKCOL = async function(request) {
    //translate the url into a file name
    let path = urlPath(request.url);
    //try to create new directory at given path
    try {
        await mkdir(path);
        //if successful, return 204 status
        return {status: 204};
        //otherwise, catch error
    } catch (error) {
        //check if error code is EEXIST
        if (error.code === "EEXIST") {
            //if so, return error code 400
            return {status: 400, body: "Directory already exists"};
        //if other error code, then throw it
        } else {
            throw error;
        }
    }
};


function openBrowser(url) {
    const platform = os.platform();
    let command = "";

    if (platform === "win32") {
        command = `start ${url}`;
    } else if (platform === "darwin") {
        command = `open ${url}`;
    } else if (platform === "linux") {
        command = `xdg-open ${url}`;
    }

    exec(command);
}
