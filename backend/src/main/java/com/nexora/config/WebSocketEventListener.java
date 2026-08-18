package com.nexora.config;

import com.nexora.service.OnlineStatusService;
import com.nexora.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final OnlineStatusService onlineStatusService;
    private final UserService userService;

    @EventListener
    public void handleConnect(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String email = accessor.getUser() != null ? accessor.getUser().getName() : null;
        if (email != null) {
            try {
                var user = userService.findByEmail(email);
                onlineStatusService.setOnline(user.getId());
            } catch (Exception ignored) {}
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String email = accessor.getUser() != null ? accessor.getUser().getName() : null;
        if (email != null) {
            try {
                var user = userService.findByEmail(email);
                onlineStatusService.setOffline(user.getId());
            } catch (Exception ignored) {}
        }
    }
}
