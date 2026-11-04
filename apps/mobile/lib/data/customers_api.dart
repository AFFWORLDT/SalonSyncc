import '../core/api/api_client.dart';
import '../models/customer.dart';
import '../models/paged.dart';
import '../models/sale.dart';

class CustomersApi {
  CustomersApi(this.api);
  final ApiClient api;

  Future<Paged<Customer>> list({String q = '', int page = 1, int pageSize = 50}) => api.get('/api/customers', (j) => Paged.fromJson(j as Map<String, dynamic>, Customer.fromJson),
      query: {if (q.trim().isNotEmpty) 'q': q.trim(), if (page > 1) 'page': page, 'page_size': pageSize});

  Future<CustomerDetail> detail(int id) => api.get('/api/customers/$id', (j) => CustomerDetail.fromJson(j as Map<String, dynamic>));

  Future<void> setOptOut(int id, bool optOut) => api.put('/api/customers/$id/whatsapp', {'opt_out': optOut}, (_) {});

  Future<Paged<Sale>> visits(int id, {int page = 1, int pageSize = 30}) =>
      api.get('/api/sales', (j) => Paged.fromJson(j as Map<String, dynamic>, Sale.fromJson), query: {'customer_id': id, if (page > 1) 'page': page, 'page_size': pageSize});
}
