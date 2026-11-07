import 'package:flutter/material.dart';
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

/// The API takes photos up to 200 KB: shrink until it fits.
const kPhotoMax = 200 * 1024;

Future<PickedPhoto?> _pick(ImageSource source) async {
  final picker = ImagePicker();
  for (final (size, q) in const [(512.0, 82), (384.0, 70), (256.0, 60)]) {
    final f = await picker.pickImage(source: source, maxWidth: size, maxHeight: size, imageQuality: q, preferredCameraDevice: CameraDevice.front);
    if (f == null) return null;
    final bytes = await f.readAsBytes();
    if (bytes.length <= kPhotoMax) return (bytes, f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  }
  return null;
}

/// Camera, gallery, or remove (when there is a photo), as a bottom sheet.
Future<PhotoChoice?> choosePhoto(BuildContext context, {required bool hasPhoto}) async {
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
            title: Text('Remove photo', style: TextStyle(color: Theme.of(c).colorScheme.error)),
            onTap: () => Navigator.pop(c, 'remove'),
          ),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (source == 'remove') return const RemovePhoto();
  if (source is! ImageSource) return null;
  final p = await _pick(source);
  return p == null ? null : NewPhoto(p);
}
