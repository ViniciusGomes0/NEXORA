package com.nexora.service;

import org.springframework.stereotype.Service;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OnlineStatusService {

    private final Set<Long> onlineUsers = ConcurrentHashMap.newKeySet();

    public void setOnline(Long userId)  { onlineUsers.add(userId); }
    public void setOffline(Long userId) { onlineUsers.remove(userId); }
    public boolean isOnline(Long userId) { return onlineUsers.contains(userId); }
}
