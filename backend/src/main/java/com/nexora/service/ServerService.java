package com.nexora.service;

import com.nexora.dto.ChannelRequest;
import com.nexora.dto.ServerRequest;
import com.nexora.model.Channel;
import com.nexora.model.Server;
import com.nexora.model.User;
import com.nexora.repository.ChannelRepository;
import com.nexora.repository.ServerRepository;
import com.nexora.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ServerService {

    private final ServerRepository serverRepository;
    private final ChannelRepository channelRepository;
    private final UserRepository userRepository;

    @Transactional
    public Server createServer(ServerRequest req, User owner) {
        Server server = Server.builder()
                .name(req.getName())
                .description(req.getDescription())
                .owner(owner)
                .inviteCode(UUID.randomUUID().toString().substring(0, 8))
                .build();
        server.getMembers().add(owner);
        server = serverRepository.save(server);

        Channel general = Channel.builder()
                .name("geral")
                .type(Channel.ChannelType.TEXT)
                .server(server)
                .build();
        Channel voice = Channel.builder()
                .name("Voz Geral")
                .type(Channel.ChannelType.VOICE)
                .server(server)
                .build();
        channelRepository.save(general);
        channelRepository.save(voice);
        return server;
    }

    @Transactional
    public Server joinServer(String inviteCode, User user) {
        Server server = serverRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new RuntimeException("Servidor não encontrado"));
        server.getMembers().add(user);
        return serverRepository.save(server);
    }

    public List<Server> getUserServers(Long userId) {
        return serverRepository.findByMemberId(userId);
    }

    public Server getServer(Long id) {
        return serverRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Servidor não encontrado"));
    }

    @Transactional
    public Channel createChannel(Long serverId, ChannelRequest req, User user) {
        Server server = getServer(serverId);
        if (!server.getOwner().getId().equals(user.getId()))
            throw new RuntimeException("Sem permissão");
        Channel channel = Channel.builder()
                .name(req.getName())
                .type(req.getType())
                .server(server)
                .build();
        return channelRepository.save(channel);
    }

    public List<Channel> getChannels(Long serverId) {
        return channelRepository.findByServerIdOrderByCreatedAtAsc(serverId);
    }

    @Transactional(readOnly = true)
    public List<User> getMembersOfServer(Long serverId) {
        return userRepository.findMembersByServerId(serverId);
    }

    @Transactional
    public Channel renameChannel(Long channelId, String newName, User user) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new RuntimeException("Canal não encontrado"));
        if (!channel.getServer().getOwner().getId().equals(user.getId()))
            throw new RuntimeException("Sem permissão");
        channel.setName(newName);
        return channelRepository.save(channel);
    }

    @Transactional
    public void deleteChannel(Long channelId, User user) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new RuntimeException("Canal não encontrado"));
        if (!channel.getServer().getOwner().getId().equals(user.getId()))
            throw new RuntimeException("Sem permissão");
        channelRepository.delete(channel);
    }

    @Transactional
    public Server updateServer(Long serverId, ServerRequest req, User user) {
        Server server = getServer(serverId);
        if (!server.getOwner().getId().equals(user.getId()))
            throw new RuntimeException("Sem permissão");
        if (req.getName() != null && !req.getName().isBlank())
            server.setName(req.getName());
        if (req.getDescription() != null)
            server.setDescription(req.getDescription());
        if (req.getIconUrl() != null)
            server.setIconUrl(req.getIconUrl());
        return serverRepository.save(server);
    }

    @Transactional
    public void deleteServer(Long serverId, User user) {
        Server server = getServer(serverId);
        if (!server.getOwner().getId().equals(user.getId()))
            throw new RuntimeException("Sem permissão");
        serverRepository.delete(server);
    }

    @Transactional
    public Server regenerateInvite(Long serverId, User user) {
        Server server = getServer(serverId);
        if (!server.getOwner().getId().equals(user.getId()))
            throw new RuntimeException("Sem permissão");
        server.setInviteCode(UUID.randomUUID().toString().substring(0, 8));
        return serverRepository.save(server);
    }
}
