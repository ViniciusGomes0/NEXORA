package com.nexora.repository;

import com.nexora.model.Channel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByServerIdOrderByCreatedAtAsc(Long serverId);
}
