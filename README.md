node-webtop
===

##What is this?
This small library allows you to access data from webtop.co.il, a popular system which schools in Israel are using in order to notify students about important messages, time changes, events happening at school and their grades.

##Why have you built this?
The service is designed like it's 2003, so I wanted to build a redesign of it. In order to do that, I needed acess to their data (aka each student's time table, time changes, messages...).

It's worth noting that the library is supported both in node and in the browser.

##Typical workflow
```js
const { Student } = require('node-webtop')

const s = new Student({
  username: 'example',
  password: 'example1'
})

s.login().then(() => {
  return s.getMessages()
}).then(messages => {
  console.log(messages)
}).catch(err => console.error(err))
```

##Available methods
`Student#login, Student#logout, Student#getTimetable, Student#getTimeChanges, Student#getEvents, Student#getMessages, Student#getInbox, Student#searchInbox, Student#getMessage`

##Feature list
 [x] Login and logout
 [x] Timetable
 [x] Timetable changes and events
 [x] Get messages from inbox
 [x] Get message by ID
 [ ] Search inbox
 [ ] Get grades
 [ ] Send messages
