/// GET /api/settings/setup: which first-run steps are done.
class SetupState {
  const SetupState({required this.logo, required this.services, required this.staff, required this.vat, required this.googleReview});
  final bool logo, services, staff, vat, googleReview;

  factory SetupState.fromJson(Map<String, dynamic> j) =>
      SetupState(logo: j['logo'] == true, services: j['services'] == true, staff: j['staff'] == true, vat: j['vat'] == true, googleReview: j['google_review'] == true);
}
