/// GET /api/settings/setup: which first-run steps are done.
class SetupState {
  const SetupState({required this.logo, required this.services, required this.staff, required this.vat, required this.googleReview, this.details = true});
  final bool logo, services, staff, vat, googleReview;

  /// Address and phone filled in (older servers don't say: counted as done).
  final bool details;

  factory SetupState.fromJson(Map<String, dynamic> j) =>
      SetupState(logo: j['logo'] == true, services: j['services'] == true, staff: j['staff'] == true, vat: j['vat'] == true, googleReview: j['google_review'] == true, details: j['details'] != false);
}
