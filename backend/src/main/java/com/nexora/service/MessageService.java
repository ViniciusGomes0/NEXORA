package com.nexora.service;

import com.nexora.dto.MessageDTO;
import com.nexora.model.Channel;
import com.nexora.model.Message;
import com.nexora.model.User;
import com.nexora.repository.ChannelRepository;
import com.nexora.repository.MessageRepository;
import org.springframework.transaction.annotation.Transactional;
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

    @Transactional
    public MessageDTO sendMessageDTO(Long channelId, String content, String imageUrl, Long replyToMessageId, User author) {
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
        Message saved = messageRepository.save(msg);
        return toDTO(saved);
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

    @Transactional
    public Long deleteMessage(Long messageId, User requester) {
        Message msg = messageRepository.findById(messageId)
                .orElseThrow(() -> new RuntimeException("Mensagem não encontrada"));
        if (!msg.getAuthor().getId().equals(requester.getId())) {
            throw new RuntimeException("Sem permissão para excluir esta mensagem");
        }
        Long channelId = msg.getChannel().getId();
        messageRepository.delete(msg);
        return channelId;
    }

    @Transactional
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
                .authorId(msg.getAuthor().getId())
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
