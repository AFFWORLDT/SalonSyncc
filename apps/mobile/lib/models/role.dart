/// Stage 1 roles: the owner and admins are both "admin" in the app.
enum Role { barber, admin }

Role roleOf(String apiRole) => apiRole == 'owner' || apiRole == 'admin' ? Role.admin : Role.barber;
