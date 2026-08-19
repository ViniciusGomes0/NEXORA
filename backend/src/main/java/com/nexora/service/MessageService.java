package com.nexora.service;

import com.nexora.dto.MessageDTO;
import com.nexora.model.Channel;
import com.nexora.model.Message;
import com.nexora.model.User;
import com.nexora.repository.ChannelRepository;
import com.nexora.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final ChannelRepository channelRepository;

    public Message sendMessage(Long channelId, String content, User author) {
        return sendMessage(channelId, content, null, null, author);
    }

    public Message sendMessage(Long channelId, String content, String imageUrl, User author) {
        return sendMessage(channelId, content, imageUrl, null, author);
    }

    public Message sendMessage(Long channelId, String content, String imageUrl, Long replyToMessageId, User author) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new RuntimeException("Canal não encontrado"));
        Message replyTo = null;
        if (replyToMessageId != null) {
            replyTo = messageRepository.findById(replyToMessageId).orElse(null);
        }
        Message msg = Message.builder()
                .content(content != null ? content : "")
                .imageUrl(imageUrl)
                .author(author)
                .channel(channel)
                .replyToMessage(replyTo)
                .build();
        return messageRepository.save(msg);
    }

    public List<MessageDTO> getMessages(Long channelId, int page) {
        return messageRepository.findByChannelIdOrderByCreatedAtDesc(channelId, PageRequest.of(page, 50))
                .stream()
                .map(this::toDTO)
                .toList();
    }

    public MessageDTO toDTO(Message msg) {
        MessageDTO.MessageDTOBuilder b = MessageDTO.builder()
                .id(msg.getId())
                .content(msg.getContent())
                .imageUrl(msg.getImageUrl())
                .authorUsername(msg.getAuthor().getUsername())
                .authorDisplayName(msg.getAuthor().getDisplayName())
                .authorAvatarUrl(msg.getAuthor().getAvatarUrl())
                .channelId(msg.getChannel().getId())
                .createdAt(msg.getCreatedAt());
        if (msg.getReplyToMessage() != null) {
            Message r = msg.getReplyToMessage();
            b.replyToMessageId(r.getId())
             .replyToAuthorName(r.getAuthor().getDisplayName() != null ? r.getAuthor().getDisplayName() : r.getAuthor().getUsername())
             .replyToContent(r.getContent())
             .replyToImageUrl(r.getImageUrl());
        }
        return b.build();
    }
}
