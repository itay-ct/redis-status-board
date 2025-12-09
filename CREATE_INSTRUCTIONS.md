i want to create a workshop instructions file,
It should be in markdown format with each section as a collapsible part.
Each section will represent a step and each step to containt an introduction section, task details, and desired output sections.

Section structure:
## Step <number>: <Title>

### Introduction
<Describe the goal, prerequisites, and concepts>

### Task Details
<Exact coding tasks, files to modify, functions to create, links to docs>

### Desired Output
<Bullet points of expected observable results>

### Notes
<Warnings, caching info, naming conventions, user-specific prefixes>

Explanations must be brief but conceptually correct (e.g., Hashes, Pub/Sub, Vector Search).
	•	Code must be runnable with Node.js 18+ and redis@4.x.
	•	Do not include unnecessary abstractions or unrelated Redis features.
	•	Emphasize learning goals over production practices.
	•	Each step should begin with the problem it solves (motivational framing).
    •	Keep all explanations beginner-friendly and avoid assumptions about prior Redis knowledge.
    •	Encourage the user to play with the code and try different things.
    •	Reference previous steps when concepts build on one another.

Introduction-
Welcome the user,
Explain about the workshop - create an instant messaging app with status updates, icons, and map locations.
All workshop participants all share a single redis cluster, which will be provided along with a username and password.
Explain about the key structure in redis, so that user "a" will have his personal prefix "a:" where he can write what he wants, also the prefix "status:a" where we will include his status data.
Redis allows to configure granular ACL and each user has been configured with the following acl (add the next line as code formatting):
+@read +@write +@connection +PUBLISH +SUBSCRIBE +FT.SEARCH +FT._LIST +FT.INFO +FT.CREATE -@dangerous %R~* %W~a:* %W~status:a:*
No need to know exactly what this ACL is all about now, but at least explain the last part of "%R~* %W~a:* %W~status:a:*"
Users are encouraged to install redisinsight, which also includes redis cli builtin.
As the first step setup your node on your machine, clone the repo and run npm install.
Introduct the file structure: frontend is index.html - it should not be touched in this workshop, server.js is the backend api layer, and redis-dal.js is the data access layer - the last one should be the file we will touch in this workshop.
Explain about redis cloud for node, which we will use to connect to the redis cluster and run commands in a native node.js way.

Step 1-
Create connection with Redis by implementing createRedisConnection and ping.
Make sure to explain how the credentials will be cached for their convinience so they don't need to re-enter it every time they reload, if they want to change it they can simply log out and enter new input.
Add a comment that if for any reason the map is visible in the ui, they can hide it and this hiding will also be cached. we will use the map only in a later step.
Link to this page in the redis doc https://redis.io/docs/latest/develop/clients/nodejs/connect/#basic-connection
* Desired output - api works in postman and right logging

Step 2-
Implement status get and set, without icons to start with, explain about hashes in redis and how they work briefly.
We will implement getStatus and updateStatus in redis-dal.js.
Because we will use a has (explain what it is) to store the status for a user while the key name will represent the username, so status:a:itay will represent a user called itay.
link this as the command to set a hash https://redis.io/docs/latest/commands/hset/ for the updateStatus, and hgetall to get all the fields & values of the hash https://redis.io/docs/latest/commands/hgetall/ for getStatus.
Ask them to please create just 1 key with a hash as value.
* Desired output - when they change the status from the selection or the status message, they can log-in to redisinsight with their user and password credentials and see their key updated with a hash containing the status and message.

Step 3-
Implement getAllStatuses that will populate the list of all users. Explain about scan operation and why it is not a best practice (mention that further on we will use much better alternative like redis query engine).
for node.js there is scanIterator which can simplify the code, but they can achieve this in any way they choose.
Link this as a reference doc for scanIterator https://github.com/redis/node-redis?tab=readme-ov-file#scan-iterator
* Desired output - They can see a list of all the users, and their status in the UI.

Step 4-
Implement realtime updates using pub/sub. Start with "notice that you need to refresh whenever someone else changes their status?", wouldn't it be more interesting to have realtime updates?? Then introduce the concept of pub/sub in redis and explain very briefly about SSE to send realtime updates to the browsers connected.
Then implement pub/sub. Explain about pub/sub and how it works, and that we now can publish updates to a special key shared among all the users called "updates", and we will also subscribe to display the updates on the screen and issue a refresh.
Please mention that by design "A client subscribed to one or more channels shouldn't issue commands" therefore we will keep another redisclient as a subscriber, separate from the main client.
Encourage them to use client.duplicate() to create the subscriber client, which is very simple and builds on the existing connection.
Link this doc https://github.com/redis/node-redis/blob/master/docs/pub-sub.md , and mention there is no do the sharded version.
* Desired output - when a user changes his status, the ui is updated in real time for all connected users, also notification pops on every update.

Step 5-
Implement icons using redis query engine. Direct the users to follow the python notbook here, explain that we don't want the participants to install any python so this link will allow them to run directly from a providioned environment.
https://colab.research.google.com/github/itay-ct/IconLoader/blob/main/IconLoader.ipynb
But make a big warning about to modify in step1 both the index and key prefix and append their username, so it should look like
INDEX_NAME = "a_lucide_icon_index"
KEY_PREFIX = "a:lucide:icon:"
when a is the user prefix, please highlight this warning so we avoid any users colliding with each other.
Make sure to highlight that they must change this BEFORE pressing play on the first cell in the notebook.
After the first step runs they should input their full redis connection string in the format of redis://<username>:<password>@<host>:<port>
Make sure that they are welcomed to create their own icon.txt file to customize their icon set, if they don't want to - they can proceed with the default icons.txt (just press cancel on step 4)
After they finish running through the notebook and confirm they loaded the icons correctly, they can also view this new data in redisinsight.
Now they need to implement the node.js code to use this new index that was created.
In terms of code structure we will implement a helper function called searchBestIcon and call it from updateStatus.
Link to this redis doc: https://redis.io/docs/latest/develop/ai/search-and-query/query/vector-search/#k-neareast-neighbours-knn
and explain we will implement a call with just the top neighbour for simplicity, where real world scenarios might query on large candidates and have additional logic to rerank the results. Also mention briefly that Redis also supports FT.HYBRID for hybrid searches.
Make sure to remind them to call searchBestIcon from updateStatus.
* Desired output - once a status is saved you will use vector search to automatically store the best icon for this message, encourage the user to play with it and try different messages and see the icon changes.

Step 6-
Implement map search using redis query engine. 
Download the GeoJSON from https://simplemaps.com/gis/country/il#all, and place it in the home directory of the project. this will be used to query only the statuses with location inside israel boundaries with a FT.SEARCH query on the index 'a_status_index', with a very simple condition '@location:[WITHIN $shape]'.
Explain about redis api that can do things like fast searching within a shape, and explain briefly about WKT and Geoshapes, and how we will relay on converting the GeoJSON file to WKT. Explain why in redis we need to save with POINT() notation.
Give them the following code snippet to add to updateStatus:
  if (statusData.longitude && statusData.latitude) {
    value.location = `POINT(${statusData.longitude} ${statusData.latitude})`;
  }
They should first FT.CREATE a proper index in redis insight, like previous step - make sure to ask them to create index in per user convention, i.e. a_status_index for user a, b_status_index for user b, etc. This index will hold all the status data including the location with GEO.
Explain about redis query engine and a bit about how it works. 
Now they need to implement the function, note that since this is a separate query that will get statuses based on their geo-location we don't need to update the original getStatus (in fact we can now go back and avoid using scans, and maybe add filtering or full text search using this index)
This link can help them understand https://redis.io/docs/latest/develop/ai/search-and-query/indexing/geoindex/#geoshape
* Desired output - users can see others on the map, and modify their location as well.

Summary-
(no need to follow the structure in this section) 
Congradulate them on completing the workshop, add some optional tasks (wihtout any further guidance), like:
1- Add a searchbox with full text search
2- Add ability to sort and filter the user by status or username
3- Add live chat functionality based on Redis sortedsets or streams
4- Generate a status using a prompt to an llm, cache the results in Redis.
