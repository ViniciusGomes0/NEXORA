package com.nexora.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
@RequiredArgsConstructor
public class VoiceController {

    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/voice/{channelId}")
    public void handleVoiceSignal(@DestinationVariable Long channelId,
                                   @Payload Map<String, Object> signal) {
        messagingTemplate.convertAndSend("/topic/voice/" + channelId, signal);
    }
}
