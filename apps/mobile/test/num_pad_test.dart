import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/modules/sale/num_pad.dart';

void main() {
  String type(String keys, {String from = '', int decimals = 2, bool fresh = false}) {
    var v = from;
    var f = fresh;
    for (final k in keys.split(' ')) {
      v = applyKey(v, k, decimals: decimals, fresh: f);
      f = false;
    }
    return v;
  }

  test('digits, dot and decimals up to the currency', () {
    expect(type('2 5'), '25');
    expect(type('2 . 5 0 9'), '2.50');
    expect(type('. 5'), '0.5');
    expect(type('0 0 7'), '7');
    expect(type('1 . 5', decimals: 0), '15');
  });

  test('00, backspace and clear', () {
    expect(type('1 00'), '100');
    expect(type('1 2 ⌫'), '1');
    expect(type('1 2 C'), '');
  });

  test('a freshly picked field is replaced by the first key', () {
    expect(type('3', from: '40', fresh: true), '3');
    expect(type('3', from: '40'), '403');
  });

  test('no more than six whole digits', () {
    expect(type('9 9 9 9 9 9 9'), '999999');
  });
}
