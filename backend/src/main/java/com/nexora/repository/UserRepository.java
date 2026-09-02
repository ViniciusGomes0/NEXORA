package com.nexora.repository;

import com.nexora.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByDisplayName(String displayName);
    boolean existsByDisplayName(String displayName);
    boolean existsByUsernameAndTag(String username, String tag);

    @Query("SELECT u.tag FROM User u WHERE u.username = :username")
    List<String> findTagsByUsername(@Param("username") String username);

    @Query("SELECT m FROM Server s JOIN s.members m WHERE s.id = :serverId")
    List<User> findMembersByServerId(@Param("serverId") Long serverId);

    @Query("SELECT COUNT(s) > 0 FROM Server s JOIN s.members m1 JOIN s.members m2 " +
           "WHERE m1.id = :userA AND m2.id = :userB")
    boolean shareAnyServer(@Param("userA") Long userA, @Param("userB") Long userB);
}
