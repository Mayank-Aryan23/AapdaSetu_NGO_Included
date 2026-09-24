import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../services/chat_storage_service.dart';
import '../services/auth_service.dart';
import '../services/location_service.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  List<Map<String, String>> messages = [];
  bool loading = false;

  // 🎤 Voice
  late stt.SpeechToText _speech;
  bool _isListening = false;

  String get userId => AuthService.currentUser?.id ?? "guest";

  @override
void didChangeDependencies() {
  super.didChangeDependencies();
  _loadMessages(); 
}

 @override
void initState() {
  super.initState();
  _loadMessages();
}
    
void _loadMessages() {
  final history = ChatStorageService.getMessages(userId);

  print("LOADED HISTORY: $history");

  setState(() {
    messages = history.map((e) => {
      "role": e["role"] as String,
      "text": e["text"] as String,
    }).toList();
  });
}

  // 🎤 START LISTENING
  void _startListening() async {
    bool available = await _speech.initialize();

    if (available) {
      setState(() => _isListening = true);

      _speech.listen(
        onResult: (result) {
          setState(() {
            _controller.text = result.recognizedWords;
          });
        },
      );
    }
  }

  void _stopListening() {
    _speech.stop();
    setState(() => _isListening = false);
  }

  // 🔥 SEND MESSAGE
  Future<String> sendMessage(String message) async {
    try {
      final history = ChatStorageService.getMessages(userId);
      final position = await LocationService.getCurrentLocation();

      final res = await Supabase.instance.client.functions.invoke(
        'chatbot',
        body: {
          "message": message,
          "history": history,
          "lat": position?.latitude,
          "lng": position?.longitude,
          "userId": userId,
        },
      );

      return res.data?["reply"] ?? "No reply";
    } catch (e) {
      return "AI unavailable. Try again.";
    }
  }

  Future<void> handleSend() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() {
      messages.add({"role": "user", "text": text});
      loading = true;
    });

    _controller.clear();

    await ChatStorageService.saveMessage(
      userId: userId,
      role: "user",
      text: text,
    );

    final reply = await sendMessage(text);

    await ChatStorageService.saveMessage(
      userId: userId,
      role: "bot",
      text: reply,
    );

    setState(() {
      messages.add({"role": "bot", "text": reply});
      loading = false;
    });

    _scrollToBottom();
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  //  MESSAGE UI
  Widget buildMessage(Map<String, String> msg) {
    final isUser = msg["role"] == "user";

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 280),
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isUser ? Colors.blue : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
          boxShadow: const [
            BoxShadow(color: Colors.black12, blurRadius: 4)
          ],
        ),
        child: Text(
          msg["text"]?.replaceAll("**", "") ?? "",
          style: TextStyle(
            color: isUser ? Colors.white : Colors.black87,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(title: const Text("AI Disaster Assistant")),
      body: Column(
        children: [
          Expanded(
           child: ListView.builder(
  controller: _scrollController,
  padding: const EdgeInsets.all(16),
  itemCount: messages.isEmpty ? 1 : messages.length,
  itemBuilder: (context, index) {

    //  EMPTY STATE (same UI)
    if (messages.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(top: 100),
        child: Center(
          child: Column(
            children: [
              Icon(Icons.support_agent, size: 60, color: Colors.grey),
              SizedBox(height: 10),
              Text(
                "Ask me about safety & alerts",
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
      );
    }

    //  CHAT MESSAGE
    return buildMessage(messages[index]);
  },
),
          ),

          if (loading)
            const Padding(
              padding: EdgeInsets.all(8),
              child: CircularProgressIndicator(),
            ),

          //  INPUT BAR WITH MIC
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: const BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(color: Colors.black12, blurRadius: 6),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: Colors.grey[200],
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: TextField(
                      controller: _controller,
                      decoration: const InputDecoration(
                        hintText: "Ask something...",
                        border: InputBorder.none,
                      ),
                    ),
                  ),
                ),

                const SizedBox(width: 8),

                // 🎤 MIC
                GestureDetector(
                  onTap:
                      _isListening ? _stopListening : _startListening,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _isListening ? Colors.red : Colors.grey[300],
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _isListening ? Icons.mic : Icons.mic_none,
                      color: _isListening ? Colors.white : Colors.black,
                    ),
                  ),
                ),

                const SizedBox(width: 8),

                //  SEND
                GestureDetector(
                  onTap: loading ? null : handleSend,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: const BoxDecoration(
                      color: Colors.blue,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.send, color: Colors.white),
                  ),
                ),
              ],
            ),
          )
        ],
      ),
    );
  }
}