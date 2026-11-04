import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/modules/sale/customer_step.dart';

void main() {
  test('UAE: local and international forms become the stored local form', () {
    expect(phoneForApi('0501234567', '971'), '0501234567');
    expect(phoneForApi('501234567', '971'), '0501234567');
    expect(phoneForApi('971501234567', '971'), '0501234567');
    expect(phoneForApi('+971 50 123 4567', '971'), '0501234567');
    expect(phoneForApi('+447700900123', '971'), '+447700900123');
  });

  test('India: a typed country code is not doubled; national length checked', () {
    expect(phoneForApi('919876543210', '91'), '+919876543210');
    expect(phoneForApi('09876543210', '91'), '+919876543210');
    expect(phoneForApi('9876543210', '91'), '+919876543210');
    expect(() => phoneForApi('98765', '91'), throwsFormatException);
  });

  test('empty is no phone; junk is rejected', () {
    expect(phoneForApi('  ', '971'), isNull);
    expect(() => phoneForApi('12', '971'), throwsFormatException);
    expect(() => phoneForApi('05abc', '971'), throwsFormatException);
  });
}
