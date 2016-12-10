// Modules
const fetch = typeof window === undefined ? require('whatwg-fetch') : require('node-fetch')
const cheerio = require('cheerio')
const moment = require('moment')
const truncate = require('truncate')
const url = require('url')

// Just some configs
const CONFIG = {
  userAgent: 'webtop/1.14 CFNetwork/808.2.9 Darwin/16.3.0', // App user agent; required only for API calls (login, logout)
  urls: {
    api: 'https://www.webtop.co.il/mobile/api/', // This is just used for login and logout; Scraping for the other features
    base: 'https://www.webtop.co.il/mobile'
  },
  paths: {
    timechanges: 'superSchool.aspx?platform=ios',
    timetable: 'superSchool.aspx?view=timetable&classNum=%1&institutionCode=%2&platform=ios',
    inbox: 'messagesBox.aspx?platform=android&view=inbox&searchQuery=%1&pageID=%2',
    message: 'messagesBox.aspx?platform=android&view=inbox&action=read&ID=%1'
  },
  strings: {
    fro: 'מאת: ', // can't from anymore cuz es2015
    noMoreMsgs: 'לא נמצאו הודעות',
    event: {
      for: 'עבור',
      room: 'חדר',
      chaperones: 'מלווים'
    }
  }
}

const {
  urls,
  userAgent,
  paths,
  strings
} = CONFIG // I know I could have just initialized these by themselves, but it's shorter and more es2015er this way

// Helper functions, to remove logic from instance functions
function processTable ($, t) {
  t = $(t)
  const tds = t.find('table').find('tr').find('td')
  const l = tds.map((n, td) => {
    td = $(td)
    td.find('br').remove()
    const isDevided = td.find('hr').length > 0
    if (td.find('span').length > 0) {
      if (isDevided) {
        const subjects = td.find('.subject').map((n, s) => $(s).text()).get()
        const teachers = td.find('.teacher').map((n, t) => $(t).text()).get()
        const lessons = subjects.map((s, i) => ({ subject: s, teacher: teachers[i] }))
        return { isMulti: true, lessons }
      } else {
        const subject = td.find('.subject').text()
        const teacher = td.find('.teacher').text()
        return { subject, teacher }
      }
    }
  }).get()
  return l
}

function processMessages ($, page) {
  const { fro, noMoreMsgs } = strings
  const tr = $('.dataGrid').find('tbody').find('tr')
  if (tr.find('td.right').length > 0) {
    const messages = tr.find('td.right').map((i, td) => {
      td = $(td)
      const date = moment(td.find('.date').text(), 'DD/MM/YYYY').format('x')
      const f = td.find('div:not(.date)').first().text().replace(fro, '').replace(/(\((.*?)\))/g, '').trim()
      const ellipsis = td.find('div:not(.date)').last().text()
      const href = td.find('div:not(.date)').first().find('a').attr('href').replace('messagesBox.aspx?platform=android&view=inbox&action=read&', '').split('&')
      const id = href[0].replace('ID=', '')
      const isRead = href[3].replace('hasBeenRead=', '') === '1'
      return { date, from: f, ellipsis, id, isRead }
    }).get()
    return { page, messages }
  } else {
    if (tr.find('td').text() === noMoreMsgs) throw new Error(`Page ${page} doesn't have any messages; Perhaps it's too big?`)
  }
}

function processEvents (event, html) {
  const $ = cheerio.load(html)
  const rows = $('table.changes:nth-child(4)').find('tbody').find('tr').map((i, tr) => {
    tr = $(tr)
    const textArr = tr.find('.content').text().split(':').map((t, i) => {
      switch (i) {
        case 0: return t.replace(event.for, '').trim()
        case 1: return t.replace(event.room, '').trim()
        case 2: return t.replace(event.chaperones, '').trim()
        default: return t.trim()
      }
    })
    const title = textArr[0]
    const room = textArr[1]
    const classroom = textArr[2]
    const chaperones = textArr[3]
    const time = tr.data('time')
    const hour = tr.data('hour')
    return { title, room, classroom, chaperones, time, hour }
  }).get()
  return rows
}

class Student {
  constructor (opts) {
    if (!opts.username || !opts.password) throw new Error('Username and password are required for authentication.')
    this._username = opts.username
    this._password = opts.password
    this._token = null
    this._classNum = null
    this._institutionCode = null
    this._clear = () => {
      this._username = null
      this._password = null
      this._token = null
      this._classNum = null
      this._institutionCode = null
    }
  }

  login () {
    const { _username, _password } = this
    let res // Ugh this is ugly
    return fetch(`${urls.api}?action=login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent
      },
      body: `username=${_username}&password=${_password}&platform=ios`
    }).then(res => res.json()).then(json => {
      if (json.error) throw new Error(`Error: ${json.error}`)
      this._token = json.token
      res = json
      return fetch(`${urls.base}/${paths.timechanges}&token=${json.token}`, {
        headers: {
          'User-Agent': userAgent.web
        }
      })
    }).then(res => res.text()).then(html => {
      const $ = cheerio.load(html)
      const href = $('#timetableLink').attr('href')
      const s = href.replace('superSchool.aspx?view=timetable&', '').split('&')
      this._classNum = s[0].replace('classNum=', '')
      this._institutionCode = s[1].replace('institutionCode=', '')
      return res
    })
  }

  logout () {
    const { _token } = this
    return fetch(`${urls.api}?action=logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Cookie': `auth=${_token}`
      },
      body: 'platform=ios'
    }).then(res => res.json()).then(o => {
      this._clear()
      return o
    })
  }

  getTimetable () {
    const { _token } = this
    const { timetable } = paths
    const p = timetable.replace('%1', this._classNum).replace('%2', this._institutionCode)
    return fetch(`${urls.base}/${p}&token=${_token}`).then(res => res.text()).then(html => {
      const $ = cheerio.load(html)
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      const timetable = {}
      $('div.weekday').each((i, t) => { timetable[days[i]] = processTable($, t) })
      return timetable
    })
  }

  getTimeChanges () {
    const { _token } = this
    const { timechanges } = paths
    return fetch(`${urls.base}/${timechanges}&token=${_token}`).then(res => res.text()).then(html => {
      const $ = cheerio.load(html)
      const rows = $('table.changes:nth-child(2)').find('tbody').find('tr').map((i, tr) => {
        tr = $(tr)
        const excuse = tr.find('.content').text()
        const time = tr.data('time')
        const hour = tr.data('hour')
        return { excuse, time, hour }
      }).get()
      return rows
    })
  }

  getEvents () {
    const { _token } = this
    const { timechanges } = paths
    const { event } = strings
    return fetch(`${urls.base}/${timechanges}&token=${_token}`).then(res => res.text()).then(html => {
      return processEvents(event, html)
    })
  }

  getMessages (page = 1, query = '') {
    const { _token } = this
    const { inbox } = paths
    const p = inbox.replace('%2', `${page}`).replace('%1', url.format(query))
    return this.fetch(`${urls.base}/${p}&token=${_token}`)
      .then(res => res.text())
      .then(html => processMessages(cheerio.load(html), page))
  }

  getInbox (page = 1) {
    return this.getMessages(page)
  }

  // @warning - not implemented yet!!
  searchInbox (query, page = 1) {
    if (!query) throw new Error('A search query is required to search the inbox.')
    return this.getMessages(page, query)
  }

  getMessage (id) {
    if (!id) throw new Error('Message ID is required in order to get a message.')
    const { _token } = this
    const { message } = paths
    const p = message.replace('%1', id)
    return fetch(`${urls.base}/${p}&token=${_token}`).then(res => res.text()).then(html => {
      const $ = cheerio.load(html)
      const info = $('table.dataGrid').find('tbody').find('tr').find('td.right').map((i, td) => $(td).text()).get()
      const date = moment(info[2], 'DD/MM/YYYY (HH:MM)').format('x')
      const htmlContent = `<div class="webtop-message-content" style="direction: rtl;">${$('.content').html().replace('\\r\\n', '')}</div>`
      const preview = truncate($('.content').text(), 100)
      return { from: info[0], subject: info[1], date, preview, htmlContent }
    })
  }
}

module.exports = {
  Student
}
