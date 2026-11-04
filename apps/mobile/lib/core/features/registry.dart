import '../../models/me.dart';
import 'feature_module.dart';

const kMaxTabs = 4;

class FeatureRegistry {
  FeatureRegistry(List<FeatureModule> modules) : _modules = [...modules]..sort((a, b) => a.order.compareTo(b.order));
  final List<FeatureModule> _modules;

  List<FeatureModule> visibleFor(Me me) => _modules.where((m) => m.visibleFor(me)).toList();

  /// The bottom-bar tabs (without "More").
  List<FeatureModule> tabsFor(Me me) => visibleFor(me).where((m) => m.tab).take(kMaxTabs).toList();

  /// Everything else the user can open, listed under "More".
  List<FeatureModule> moreFor(Me me) {
    final tabs = tabsFor(me).toSet();
    return visibleFor(me).where((m) => !tabs.contains(m)).toList();
  }

  FeatureModule? byId(String id) {
    for (final m in _modules) {
      if (m.id == id) return m;
    }
    return null;
  }

  bool isVisible(String id, Me me) => byId(id)?.visibleFor(me) ?? false;
}
