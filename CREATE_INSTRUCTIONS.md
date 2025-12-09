i want to create a workshop instructions file,
It should be in markdown format with tabs like this
https://github.com/mkdocs/mkdocs?tab=readme-ov-file
I want each tab to reprsent a step and each step to containt an introduction section, task details, and desired output sections.

Step 1-
Create connection with Redis by implementing createRedisConnection and ping.
Make sure to explain how the credentials will be cached for their convinience so they don't need to re-enter it every time they reload, if they want to change it they can simply log out and enter new input.
Add a comment that if for any reason the map is visible in the ui, they can hide it and this hiding will also be cached. we will use the map only in a later step.
* Desired output - api works in postman and right logging

Step 2-
Implement status get and set, without icons to start with, explain about hashes in redis and how they work briefly.
* Desired output - when they change the status from the selection or the status message, they can log-in to redisinsight with their user and password credentials and see their key updated with a hash containing the status and message.

Step 3-
Implement getAllStatuses that will populate the list of all users. Explain about scan operation and why it is not a best practice (mention that further on we will use much better alternative like redis query engine)
* Desired output - They can see a list of all the users, and their status in the UI.

Step 4-
Implement realtime updates using pub/sub. Start with "notice that you need to refresh whenever someone else changes their status?", wouldn't it be more interesting to have realtime updates?? Then introduce the concept of pub/sub in redis and explain very briefly about SSE to send realtime updates to the browsers connected.
Then implement pub/sub. Explain about pub/sub and how it works, and that we now can publish updates to a special key shared among all the users called "updates", and we will also subscribe to display the updates on the screen and issue a refresh.
* Desired output - when a user changes his status, the ui is updated in real time for all connected users

Step 5-
Implement icons using redis query engine. Direct the users to follow the python notbook here
https://colab.research.google.com/github/itay-ct/IconLoader/blob/main/IconLoader.ipynb#scrollTo=run_tests
But make a big warning about to modify in step1 both the index and key prefix and append their username, so it should look like
INDEX_NAME = "a_lucide_icon_index"
KEY_PREFIX = "a:lucide:icon:"
when a is the user prefix, please highlight this warning so we avoid any users colliding with each other.
Make sure that they are welcomed to create their own icon.txt file to customize their icon set, if they don't want to - they can proceed with the default icons.txt (just press cancel on step 4)
* Desired output - once a status is saved you will use vector search to automatically store the best icon for this message

Step 6-
Implement map search using redis query engine. 
Download the GeoJSON from https://simplemaps.com/gis/country/il#all, explain about redis api that can do things like fast searching within a shape.
They should first FT.CREATE a proper index in redis insight that will hold all the status data including the location with GEO
Explain about redis query engine and how it works. Desired output - when a user changes status, the ui is updated in real time for all connected users
* Desired output - users can see others on the map, and change their location as well.