import 'package:hive/hive.dart';

class ChatStorageService {
  static final _box = Hive.box('chat');

  static List<Map<String, dynamic>> getMessages(String userId) {
    final data = _box.get('chat_$userId', defaultValue: []);
    return List<Map<String, dynamic>>.from(data);
  }

  static Future<void> saveMessage({
    required String userId,
    required String role,
    required String text,
  }) async {
    final messages = getMessages(userId);

    messages.add({
      "role": role,
      "text": text,
      "timestamp": DateTime.now().toIso8601String(),
    });

    if (messages.length > 10) {
      messages.removeAt(0);
    }

    await _box.put('chat_$userId', messages);
  }

  static Future<void> clear(String userId) async {
    await _box.delete('chat_$userId');
  }
}