import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/format/fmt.dart';
import '../../core/share/bill_share.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/states.dart';
import '../../data/sales_api.dart';
import '../../models/me.dart';
import '../../models/sale.dart';

typedef OpenUrl = Future<void> Function(String url);
typedef ShareText = Future<void> Function(String text, String subject);

Future<void> _openExternal(String url) async {
  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}

Future<void> _shareSheet(String text, String subject) async {
  await Share.share(text, subject: subject);
}

/// The share buttons for the signed-in salon (used by the "bill generated" screen and bill views).
Widget shareActionsFor(BuildContext context, Sale sale) {
  final auth = Get.find<AuthController>();
  final me = auth.me.value!;
  return ShareButtons(sale: sale, me: me, slug: me.org.slug, sales: SalesApi(auth.api, me.fmt));
}

/// WhatsApp (the customer's chat, via wa.me), Share link (the phone's share sheet), and — when the salon has its own
/// WhatsApp number connected — "Send from the salon number" through the API, with its delivery status.
class ShareButtons extends StatefulWidget {
  const ShareButtons({super.key, required this.sale, required this.me, required this.slug, required this.sales, this.open = _openExternal, this.share = _shareSheet});
  final Sale sale;
  final Me me;
  final String slug;
  final SalesApi sales;
  final OpenUrl open;
  final ShareText share;

  @override
  State<ShareButtons> createState() => _ShareButtonsState();
}

class _ShareButtonsState extends State<ShareButtons> {
  String? _status;
  bool _sending = false;
  Timer? _recheck;

  BillShare get _b => BillShare(slug: widget.slug, settings: widget.me.salon, fmt: widget.me.fmt);
  bool get _cloud => widget.me.features.contains('whatsapp') && widget.me.salon.waReady && widget.sale.customerPhone != null;

  @override
  void dispose() {
    _recheck?.cancel();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending) return;
    Haptic.tap();
    setState(() => _sending = true);
    try {
      final s = await widget.sales.sendWhatsApp(widget.sale.id);
      if (!mounted) return;
      setState(() => _status = s);
      _recheck = Timer(const Duration(milliseconds: 3500), () async {
        try {
          final again = await widget.sales.whatsAppStatus(widget.sale.id);
          if (mounted && again != null) setState(() => _status = again);
        } catch (_) {}
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(messageOf(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  static String _label(String s) => switch (s) { 'sent' => 'Sent', 'failed' => 'Not sent', 'skipped' => 'Skipped', _ => 'Queued' };

  @override
  Widget build(BuildContext context) {
    final b = _b, s = widget.sale;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(
          child: FilledButton.tonalIcon(
            onPressed: () {
              Haptic.tap();
              widget.open(b.whatsAppLink(s));
            },
            icon: const Icon(Icons.chat_outlined),
            label: const Text('WhatsApp'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton.tonalIcon(
            onPressed: () {
              Haptic.tap();
              widget.share(b.shareText(s), b.shareTitle(s));
            },
            icon: const Icon(Icons.ios_share_rounded),
            label: const Text('Share link'),
          ),
        ),
      ]),
      if (_cloud) ...[
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _sending ? null : _send,
          icon: const Icon(Icons.send_rounded),
          label: const Text('Send from the salon number'),
        ),
        if (_status != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_label(_status!), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          ),
      ],
    ]);
  }
}
