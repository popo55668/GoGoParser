import pdfreader from 'pdfreader';
import moment from 'moment';
const parser = new pdfreader.PdfReader();
var columnTitles = [
  { title: '消費日', x: 0  }, 
  { title: '入帳起息日', x: 0 }, 
  { title: '消費明細', x: 0 },
  { title: '新臺幣金額', x: 0 },
  { title: '外幣折算日', x: 0 },
  { title: '消費地', x: 0 }, 
  { title: '幣別', x: 0 },
  { title: '外幣金額', x: 0 }];

const parse = pdf => new Promise((resolve, reject) => {
  var items = [];
  var list = [];
  var fileReader = new FileReader();
  fileReader.onload = function() {
    parser.parseBuffer(this.result, (err, obj) => {
      if (err) {
        reject(err);
      } else if (!obj) {
        let state = 'checking';
        let isGoodRow = false;
        let checksum = 0;
        items.forEach(item => {
          if (item.text.indexOf('＠ＧｏＧｏ卡') > -1) {
            state = 'done';
          }
          switch (state) {
            case 'checking':
              if (item.text === '+本期新增款項') {
                state = 'checked';
              }
              break;
            case 'checked':
              checksum = parseInt(item.text.replace(/,/,''));
              if (isNaN(checksum)) {
                console.error('Failed to find checksum.');
              }
              state = 'collectColumn';
              break;
            case 'collectColumn':
              columnTitles.forEach(function(column) {
                if (item.text === column.title) {
                  column.x = item.x;
                }
              });
              if (item.text === '外幣金額') {
                state = 'collectList';
              }
              break;
            case 'collectList':
              if (item.x < columnTitles[0].x) {
                // Encounter a new line -> check whether the text is formatted date
                var ad = parseInt(item.text.substr(0,3)) + 1911;
                if (isNaN(ad)) {
                  isGoodRow = false;
                } else {
                  isGoodRow = true;
                  list.push({'消費日':'','入帳起息日':'','消費明細':'','新臺幣金額':0,
                    '外幣折算日':'','消費地':'','幣別':'','外幣金額':0, 'ts': 0, 'refund': false});
                  let date = ad + item.text.substr(3);
                  list[list.length-1]['消費日'] += date;
                  list[list.length-1]['ts'] = moment.utc(date, 'YYYY/MM/DD').subtract(8, 'hours'); // Assume GMT+8
                }
              } else if (isGoodRow) {
                for (var i = columnTitles.length-1; i > 0; i--) {
                  if (columnTitles[i].x <= item.x) {
                    if (i === 3 || i === 7) {
                      var value = parseInt(item.text.replace(/,/,''));
                      if (value < 0) list[list.length-1]['refund'] = true;
                      if (isNaN(value)) console.error('Not a number: ' + item.text);
                      else list[list.length-1][columnTitles[i].title] += value;
                    } else {
                      list[list.length-1][columnTitles[i].title] += item.text;
                    }
                    break;
                  }
                }
              }
              break;
          } // end of switch
        });
        const payment = list.shift(); // remove 繳款
        const sum = list.reduce((acc, current) => acc + current['新臺幣金額'], 0);
        console.log('Billing total: ' + sum);
        console.log('Expected: ' + checksum);
        resolve({payment: payment, items: list, checksum: checksum, sum: sum});
      } else if (obj.text) {
        items.push(obj);
      }
    });
  }
  fileReader.readAsArrayBuffer(pdf);
});

export { parse }
