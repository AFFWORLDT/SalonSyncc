import 'json.dart';

class Rating {
  const Rating({required this.id, required this.billNo, required this.day, required this.barberName, required this.customerLabel, required this.stars, this.comment, required this.updatedAt});
  final int id, stars, updatedAt;
  final String billNo, day, barberName, customerLabel;
  final String? comment;
  factory Rating.fromJson(Map<String, dynamic> j) => Rating(
        id: integer(j, 'id'),
        billNo: str(j, 'bill_no'),
        day: str(j, 'day'),
        barberName: str(j, 'barber_name'),
        customerLabel: str(j, 'customer_label'),
        stars: integer(j, 'stars'),
        comment: strOrNull(j, 'comment'),
        updatedAt: integer(j, 'updated_at'),
      );
}

class BarberRating {
  const BarberRating({required this.name, required this.count, this.average});
  final String name;
  final int count;
  final num? average;
}

class GoogleTaps {
  const GoogleTaps({required this.name, required this.asked, required this.clicked});
  final String name;
  final int asked, clicked;
}

/// GET /api/ratings?from=&to=.
class RatingsReport {
  const RatingsReport({required this.from, required this.to, required this.count, this.average, required this.barbers, required this.ratings, required this.asked, required this.clicked, required this.google});
  final String from, to;
  final int count, asked, clicked;
  final num? average;
  final List<BarberRating> barbers;
  final List<Rating> ratings;
  final List<GoogleTaps> google;

  factory RatingsReport.fromJson(Map<String, dynamic> j) {
    final g = obj(j['google'], 'google');
    List l(Object? v) => v is List ? v : throw const FormatException('Expected a list');
    return RatingsReport(
      from: str(j, 'from'),
      to: str(j, 'to'),
      count: integer(j, 'count'),
      average: numOrNull(j, 'average'),
      barbers: [for (final x in l(j['barbers'])) BarberRating(name: str(obj(x, 'b'), 'barber_name'), count: integer(obj(x, 'b'), 'count'), average: numOrNull(obj(x, 'b'), 'average'))],
      ratings: [for (final x in l(j['ratings'])) Rating.fromJson(obj(x, 'rating'))],
      asked: integer(g, 'asked'),
      clicked: integer(g, 'clicked'),
      google: [for (final x in l(g['barbers'])) GoogleTaps(name: str(obj(x, 'g'), 'barber_name'), asked: integer(obj(x, 'g'), 'asked'), clicked: integer(obj(x, 'g'), 'clicked'))],
    );
  }
}
