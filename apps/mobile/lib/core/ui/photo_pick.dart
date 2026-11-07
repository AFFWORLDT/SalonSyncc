import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';

/// A picked photo, ready to upload: the bytes and their content type.
typedef PickedPhoto = (List<int> bytes, String type);

/// What the photo sheet chose: a new photo, remove the current one, or (null) nothing.
sealed class PhotoChoice {
  const PhotoChoice();
}

class NewPhoto extends PhotoChoice {
  const NewPhoto(this.photo);
  final PickedPhoto photo;
}

class RemovePhoto extends PhotoChoice {
  const RemovePhoto();
}

/// The crop: a square (photos, logos) or a wide 3:1 banner.
enum PhotoShape { square, banner }

/// The API takes up to 300 KB; we aim a little under so the upload is quick.
const kPhotoMax = 300 * 1024;
const kPhotoTarget = 260 * 1024;

/// Shrinks [bytes] to a JPEG under [maxBytes], stepping quality and size down; null if even the smallest won't fit.
Future<Uint8List?> compressToFit(Uint8List bytes, {required PhotoShape shape, int maxBytes = kPhotoTarget}) async {
  final (w, h) = shape == PhotoShape.banner ? (1500, 500) : (800, 800);
  for (final (scale, q) in const [(1.0, 85), (1.0, 75), (0.8, 70), (0.65, 65), (0.5, 60), (0.4, 55)]) {
    final out = await FlutterImageCompress.compressWithList(bytes, minWidth: (w * scale).round(), minHeight: (h * scale).round(), quality: q, format: CompressFormat.jpeg);
    if (out.length <= maxBytes) return out;
  }
  return null;
}

/// Pick → crop (square or 3:1, with the phone's own crop screen) → compress on the phone to under [maxBytes].
Future<PickedPhoto?> pickAndCrop(BuildContext context, ImageSource source, {PhotoShape shape = PhotoShape.square, int maxBytes = kPhotoTarget}) async {
  final cs = Theme.of(context).colorScheme;
  final light = Theme.of(context).brightness == Brightness.light;
  final f = await ImagePicker().pickImage(source: source, maxWidth: 2400, maxHeight: 2400, imageQuality: 95, preferredCameraDevice: CameraDevice.front);
  if (f == null) return null;
  final banner = shape == PhotoShape.banner;
  final title = banner ? 'Crop banner' : 'Crop photo';
  final cropped = await ImageCropper().cropImage(
    sourcePath: f.path,
    aspectRatio: banner ? const CropAspectRatio(ratioX: 3, ratioY: 1) : const CropAspectRatio(ratioX: 1, ratioY: 1),
    compressFormat: ImageCompressFormat.jpg,
    compressQuality: 92,
    uiSettings: [
      AndroidUiSettings(
        toolbarTitle: title,
        toolbarColor: cs.surface,
        toolbarWidgetColor: cs.onSurface,
        statusBarLight: light,
        activeControlsWidgetColor: cs.primary,
        lockAspectRatio: true,
        hideBottomControls: false,
        cropStyle: banner ? CropStyle.rectangle : CropStyle.circle,
      ),
      IOSUiSettings(title: title, aspectRatioLockEnabled: true, resetAspectRatioEnabled: false, cropStyle: banner ? CropStyle.rectangle : CropStyle.circle),
    ],
  );
  if (cropped == null) return null;
  final raw = await File(cropped.path).readAsBytes();
  final small = await compressToFit(raw, shape: shape, maxBytes: maxBytes);
  return small == null ? null : (small, 'image/jpeg');
}

/// Camera, gallery, or remove (when there is one), as a bottom sheet; then crop and compress.
Future<PhotoChoice?> choosePhoto(BuildContext context, {required bool hasPhoto, PhotoShape shape = PhotoShape.square, int maxBytes = kPhotoTarget, String noun = 'photo'}) async {
  final source = await showModalBottomSheet<Object>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take a photo'), onTap: () => Navigator.pop(c, ImageSource.camera)),
        ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose from gallery'), onTap: () => Navigator.pop(c, ImageSource.gallery)),
        if (hasPhoto)
          ListTile(
            leading: Icon(Icons.delete_outline_rounded, color: Theme.of(c).colorScheme.error),
            title: Text('Remove $noun', style: TextStyle(color: Theme.of(c).colorScheme.error)),
            onTap: () => Navigator.pop(c, 'remove'),
          ),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (source == 'remove') return const RemovePhoto();
  if (source is! ImageSource || !context.mounted) return null;
  final p = await pickAndCrop(context, source, shape: shape, maxBytes: maxBytes);
  return p == null ? null : NewPhoto(p);
}
