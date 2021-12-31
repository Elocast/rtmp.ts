# the idea
this project is not a pure RTMP implementation. It consists of modules, each working side by side - not dependent on each other, but rather responding to events broadcasted by one another. Modules should not be cross referenced, should NOT modify each others properties - unless proxied by the parent (the main app). Modules should be seperated by directories, which are their own, seperate environments. An exception to the rule might be a module purely built for the purpose of extending RTMP limitations. you'll probably find a couple of instances where that happens - such as the AUTH module, which is a middleware between the API and the RTMP client, however - those interactions should be limited to minimum. By following such pattern, we end up with a flexible environment, allowing us to switch modules without affecting the workflow of the entirety of the app, as long as the inner-API is kept.

# the roadmap
there is no official roadmap, rather a wishlist of improvements.

1. WIKI - document all the modules, and their functionality
2. Seperate modules from the main app. Modules should be importable with package manager

# modules
### RTMP
A media capturing server. Largely pure Adobe's adaptaion.

### GlobalEmitter
an event bus, based on the Node Events module. Its the main form of the async communication between modules. At this stage, its a basic wrap-around Event's native API. By replacing node's Event bus with an MQ, we could cross-communicate between many instances, or use it for Server-RTMP communication, and by applying the same schema standard, we could transition without affecting other parts of the app.

### AUTH
an auth manager. Communicates with the Server, and keeps track of which stream is connected to which RTMP session instance.

### HTTP
an HTTP server, used mainly to serve static files.

### TCODE
a transcoding manager, uses ffmpeg underneeth the hood. Each broadcast can be split into multiple tasks.

# notes
this project is not compiled with `typescript`. Instead, it uses `babel` with a `typescript preset`, and compiles the code that way. It allows us for more flexible setups, while keeping the typechecking functionality of TS.

whats not done:
* tests for routing/middleware routes RTMP/sessions. seems unecessary
* tests for the TCODE module

# install
as with any node app, start off with:
`npm install`

You'll also need an FFMPEG, for both; the server and yourself.

debian/ubuntu
```
sudo apt install ffmpeg
```

arch
```
sudo pacman -S ffmpeg
```

mac:
```
brew install ffmpeg
```

# development env
### .env
rename the `.env.example` file to `.env` and modify it accordingly to your needs. A full set of ENV values can be find in `src/config.ts` file.

If you're unsure about path to your ffmpeg install, you can find it with
```
which ffmpeg
```

for `API_URL` use URI to your test server

shell path can be ignored, as we currently aren't making use of that.

### running the app
You can either run the app compiled (booring, takes too long), or let the app compile for you IRL as you make changes.

nodemon:
```
npm run dev
```

build & start:
```
npm run start
```

tests:
```
npm run test
```

lint:
```
npm run lint
```

types:
```
npm run types
```


### broadcasting
broadcasting over the RTMP protocol is fairly simple with FFMPEG. What's important, is to add a `-re` flag before the input is specified, as it simulates an IRL broadcast, by reading and pushing chunks of the file in it's native bit rate.

with file:
```
ffmpeg -re -i <PATH_TO_FILE> -f flv rtmp://0.0.0.0:1935/live/<STREAM_ID>
```

without file (generate video):
```
ffmpeg -re -f lavfi -i testsrc -t <TIME_IN_SECONDS> -pix_fmt yuv420p -f flv rtmp://0.0.0.0:1935/live/<STREAM_ID>
```
# build
Docker SHOULD NOT use the .env file, instead necessary ENV variables should be provided in docker-compose file.
