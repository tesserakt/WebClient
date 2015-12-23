angular.module('proton.actions', [])

.factory('action', function(
    $q,
    $rootScope,
    tools,
    cache,
    Conversation,
    Message,
    networkActivityTracker,
    CONSTANTS
) {
    return {
        // Conversation actions
        /**
         * Move conversation
         * @param {Array} ids
         * @param {String} mailbox
         */
        moveConversation: function(ids, mailbox) {
            var events = [];
            var current = tools.currentLocation();
            var context = tools.cacheContext();
            var promise;
            var labelIDsAdded = [CONSTANTS.MAILBOX_IDENTIFIERS[mailbox]];
            var labelIDsRemoved = _.reject([current], function(labelID) {
                // Remove starred and labels
                return labelID === CONSTANTS.MAILBOX_IDENTIFIERS.starred || labelID.length > 2;
            });

            // Generate cache events
            _.each(ids, function(id) {
                var element = {
                    ID: id,
                    Selected: false,
                    LabelIDsRemoved: labelIDsRemoved, // Remove current location
                    LabelIDsAdded: labelIDsAdded // Add new location
                };
                var messages = cache.queryMessagesCached(element.ID);

                if(messages.length > 0) {
                    _.each(messages, function(message) {
                        message.Selected = false;
                        message.LabelIDsRemoved = labelIDsRemoved; // Remove current location
                        message.LabelIDsAdded = labelIDsAdded; // Add new location
                        events.push({Action: 3, ID: message.ID, Message: message});
                    });
                }

                events.push({Action: 3, ID: element.ID, Conversation: element});
            });

            // Send request
            promise = Conversation[mailbox](ids);

            if(context === true) {
                // Send cache events
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send cache events
                    cache.events(events);
                });

                networkActivityTracker.track(promise);
            }
        },
        /**
         * Apply labels on a list of conversations
         * @param {Array} ids
         * @param {Array} labels
         * @param {Boolean} alsoArchive
         */
        labelConversation: function(ids, labels, alsoArchive) {
            var REMOVE = 0;
            var ADD = 1;
            var promises = [];
            var events = [];
            var current = tools.currentLocation();
            var context = tools.cacheContext();

            _.each(ids, function(id) {
                var elementCached = cache.getConversationCached(id);
                var messages = cache.queryMessagesCached(elementCached.ID);
                var toApply = _.map(_.filter(labels, function(label) {
                    return label.Selected === true && angular.isArray(elementCached.LabelIDs) && elementCached.LabelIDs.indexOf(label.ID) === -1;
                }), function(label) {
                    return label.ID;
                }) || [];
                var toRemove = _.map(_.filter(labels, function(label) {
                    return label.Selected === false && angular.isArray(elementCached.LabelIDs) && elementCached.LabelIDs.indexOf(label.ID) !== -1;
                }), function(label) {
                    return label.ID;
                }) || [];

                if(alsoArchive === true) {
                    toApply.push(CONSTANTS.MAILBOX_IDENTIFIERS.archive);
                    toRemove.push(current);
                }

                var element = {
                    ID: id,
                    Selected: false,
                    LabelIDsAdded: toApply,
                    LabelIDsRemoved: toRemove
                };

                _.each(messages, function(message) {
                    message.LabelIDsAdded = toApply;
                    message.LabelIDsRemoved = toRemove;
                    events.push({Action: 3, ID: message.ID, Message: message});
                });

                events.push({Action: 3, ID: elementCached.ID, Conversation: element});

                _.each(toApply, function(labelID) {
                    promises.push(Conversation.labels(labelID, ADD, ids));
                });

                _.each(toRemove, function(labelID) {
                    promises.push(Conversation.labels(labelID, REMOVE, ids));
                });
            });

            if(context === true) {
                cache.events(events);
            } else {
                networkActivityTracker.track($q.all(promises).then(function(results) {
                    if(context === false) {
                        cache.events(events);
                    }

                    if(alsoArchive === true) {
                        Conversation.archive(ids); // Send request to archive conversations
                    }
                }));
            }
        },
        /**
         * Star conversation
         * @param {String} id - conversation id
         */
        starConversation: function(id) {
            var events = [];
            var context = tools.cacheContext();
            var promise;
            var element = {
                ID: id,
                LabelIDsAdded: [CONSTANTS.MAILBOX_IDENTIFIERS.starred]
            };
            var messages = cache.queryMessagesCached(element.ID);

            // Generate message changes with event
            if(messages.length > 0) {
                _.each(messages, function(message) {
                    message.LabelIDsAdded = [CONSTANTS.MAILBOX_IDENTIFIERS.starred];
                    events.push({ID: message.ID, Action: 3, Message: message});
                });
            }

            // Generate conversation changes with event
            events.push({ID: element.ID, Action: 3, Conversation: element});

            // Send conversation request
            promise = Conversation.star([element.ID]);

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });

                networkActivityTracker.track(promise);
            }
        },
        /**
         * Unstar conversation
         * @param {String} id - conversation id
         */
        unstarConversation: function(id) {
            var events = [];
            var context = tools.cacheContext();
            var promise;
            var element = {
                ID: id,
                LabelIDsRemoved: [CONSTANTS.MAILBOX_IDENTIFIERS.starred]
            };
            var messages = cache.queryMessagesCached(element.ID);

            // Generate message changes with event
            if(messages.length > 0) {
                _.each(messages, function(message) {
                    message.LabelIDsRemoved = [CONSTANTS.MAILBOX_IDENTIFIERS.starred];
                    events.push({ID: message.ID, Action: 3, Message: message});
                });
            }

            // Generate conversation changes with event
            events.push({ID: element.ID, Action: 3, Conversation: element});

            // Send request
            promise = Conversation.unstar([element.ID]);

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });

                networkActivityTracker.track(promise);
            }
        },
        /**
         * Mark as read a list of conversation
         * @param {Array} ids
         */
        readConversation: function(ids) {
            var events = [];
            var context = tools.cacheContext();
            var promise;

            // Generate cache events
            _.each(ids, function(id) {
                var element = {
                    ID: id,
                    Selected: false
                };
                var messages = cache.queryMessagesCached(element.ID);

                element.NumUnread = 0;

                if(messages.length > 0) {
                    _.each(messages, function(message) {
                        message.IsRead = 1;
                        events.push({Action: 3, ID: message.ID, Message: message});
                    });
                }

                events.push({Action: 3, ID: element.ID, Conversation: element});
            });

            // Send request
            promise = Conversation.read(ids);

            if(context === true) {
                cache.events(events);
            } else {
                promise.then(function() {
                    cache.events(events);
                });
            }
        },
        /**
         * Mark as unread a list of conversation
         * @param {Array} ids
         */
        unreadConversation: function(ids) {
            var events = [];
            var context = tools.cacheContext();
            var promise;

            // Generate cache events
            _.each(ids, function(id) {
                var elementCached;
                var element = {
                    ID: id,
                    Selected: false
                };
                var messages = cache.queryMessagesCached(element.ID);

                elementCached = cache.getConversationCached(id);
                element.NumUnread = elementCached.NumMessages;

                if(messages.length > 0) {
                    var last = _.last(messages); // Unread only the latest

                    last.IsRead = 0;
                    events.push({Action: 3, ID: last.ID, Message: last});
                }

                events.push({Action: 3, ID: element.ID, Conversation: element});
            });

            // Send request
            promise = Conversation.unread(ids);

            if(context === true) {
                cache.events(events);
            } else {
                promise.then(function() {
                    cache.events(events);
                });
            }
        },
        /**
         * Delete a list of conversations
         * @param {ids}
         */
        deleteConversation: function(ids) {
            var events = [];
            var context = tools.cacheContext();
            var promise;

            // Generate cache event
            _.each(ids, function(id) {
                var messages = cache.queryMessagesCached(id);

                $rootScope.$broadcast('deleteConversation', id); // Close composer

                if(messages.length > 0) {
                    _.each(messages, function(message) {
                        events.push({Action: 0, ID: message.ID});
                    });
                }

                events.push({Action: 0, ID: id});
            });

            // Send request
            promise = Conversation.delete(ids);

            if(context === true) {
                // Send cache event
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send cache event
                    cache.events(events);
                });
            }
        },
        // Message actions
        moveMessage: function(ids, mailbox) {
            var events = [];
            var current = tools.currentLocation();
            var context = tools.cacheContext();
            var promise;
            var labelIDsAdded = [CONSTANTS.MAILBOX_IDENTIFIERS[mailbox]];
            var labelIDsRemoved = _.reject([current], function(labelID) {
                // Remove starred and labels
                return labelID === CONSTANTS.MAILBOX_IDENTIFIERS.starred || labelID.length > 2;
            });

            // Generate cache events
            _.each(ids, function(id) {
                var message = cache.getMessageCached(id);
                var conversation = cache.getConversationCached(message.ConversationID);
                var element = {
                    ID: id,
                    Selected: false,
                    LabelIDsRemoved: labelIDsRemoved, // Remove current location
                    LabelIDsAdded: labelIDsAdded // Add new location
                };

                events.push({Action: 3, ID: element.ID, Message: element});
            });

            // Send request
            promise = Message[mailbox](ids).$promise;

            if(context === true) {
                // Send cache events
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send cache events
                    cache.events(events);
                });

                networkActivityTracker.track(promise);
            }
        },
        /**
         * Apply labels on a list of messages
         * @param {Array} messages
         * @param {Array} labels
         * @param {Boolean} alsoArchive
         */
        labelMessage: function(messages, labels, alsoArchive) {
            var REMOVE = 0;
            var ADD = 1;
            var promises = [];
            var events = [];
            var current = tools.currentLocation();
            var context = tools.cacheContext();
            var ids =  _.map(messages, function(message) { return message.ID; });

            _.each(messages, function(message) {
                var toApply = _.map(_.filter(labels, function(label) {
                    return label.Selected === true && angular.isArray(message.LabelIDs) && message.LabelIDs.indexOf(label.ID) === -1;
                }), function(label) {
                    return label.ID;
                }) || [];
                var toRemove = _.map(_.filter(labels, function(label) {
                    return label.Selected === false && angular.isArray(message.LabelIDs) && message.LabelIDs.indexOf(label.ID) !== -1;
                }), function(label) {
                    return label.ID;
                }) || [];

                if(alsoArchive === true) {
                    toApply.push(CONSTANTS.MAILBOX_IDENTIFIERS.archive);
                    toRemove.push(current);
                }

                var element = {
                    ID: message.ID,
                    Selected: false,
                    LabelIDsAdded: toApply,
                    LabelIDsRemoved: toRemove
                };

                events.push({Action: 3, ID: element.ID, Message: element});

                _.each(toApply, function(labelID) {
                    promises.push(new Message().updateLabels(labelID, ADD, ids));
                });

                _.each(toRemove, function(labelID) {
                    promises.push(new Message().updateLabels(labelID, REMOVE, ids));
                });
            });

            if(context === true) {
                cache.events(events);
            } else {
                networkActivityTracker.track($q.all(promises).then(function(results) {
                    if(context === false) {
                        cache.events(events);
                    }

                    if(alsoArchive === true) {
                        Message.archive({IDs: ids}); // Send request to archive conversations
                    }
                }));
            }
        },
        /**
         * Star a message
         * @param {String} id
         */
        starMessage: function(id) {
            var ids = [id];
            var events = [];
            var context = tools.cacheContext();
            var labelIDsAdded = [CONSTANTS.MAILBOX_IDENTIFIERS.starred];
            var message = cache.getMessageCached(id);
            var promise;

            // Messages
            message.LabelIDsAdded = labelIDsAdded;
            events.push({Action: 3, ID: message.ID, Message: message});

            // Conversation
            events.push({Action: 3, ID: message.ConversationID, Conversation: {ID: message.ConversationID, LabelIDsAdded: labelIDsAdded}});

            // Send request
            promise = Message.star({IDs: ids}).$promise;

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });

                networkActivityTracker.track(promise);
            }
        },
        /**
         * Unstar a message
         * @param {String} id
         */
        unstarMessage: function(id) {
            var ids = [id];
            var events = [];
            var context = tools.cacheContext();
            var labelIDsRemoved = [CONSTANTS.MAILBOX_IDENTIFIERS.starred];
            var message = cache.getMessageCached(id);
            var messages = cache.queryMessagesCached(message.ConversationID);
            var stars = _.filter(messages, function(message) {
                return message.LabelIDs && message.LabelIDs.indexOf(CONSTANTS.MAILBOX_IDENTIFIERS.starred) !== -1;
            });
            var promise;

            // Messages
            message.LabelIDsRemoved = labelIDsRemoved;
            events.push({Action: 3, ID: message.ID, Message: message});

            // Conversation
            if(stars.length === 1) {
                events.push({Action: 3, ID: message.ConversationID, Conversation: {ID: message.ConversationID, LabelIDsRemoved: labelIDsRemoved}});
            }

            // Send request
            promise = Message.unstar({IDs: ids}).$promise;

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });

                networkActivityTracker.track(promise);
            }
        },
        /**
         * Mark as read a list of messages
         * @param {Array} ids
         */
        readMessage: function(ids) {
            var events = [];
            var context = tools.cacheContext();
            var promise;

            _.each(ids, function(id) {
                var message = cache.getMessageCached(id);
                var conversation = cache.getConversationCached(message.ConversationID);

                // Generate message event
                message.IsRead = 1;
                events.push({Action: 3, ID: message.ID, Message: message});

                // Generate conversation event
                if(angular.isDefined(conversation)) {
                    conversation.NumUnread = 0;
                    events.push({Action: 3, ID: conversation.ID, Conversation: conversation});
                }
            });

            // Send request
            promise = Message.read({IDs: ids}).$promise;

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });
            }
        },
        /**
         * Mark as unread a list of messages
         * @param {Array} ids
         */
        unreadMessage: function(ids) {
            var events = [];
            var context = tools.cacheContext();
            var promise;

            _.each(ids, function(id) {
                var message = cache.getMessageCached(id);
                var conversation = cache.getConversationCached(message.ConversationID);
                var messages = cache.queryMessagesCached(message.ConversationID);
                var unreads = _.where(messages, {IsRead: 0});

                // Generate message event
                message.IsRead = 0;
                message.expand = undefined; // Trick to close message and force to pass in iniView after
                events.push({Action: 3, ID: message.ID, Message: message});

                // Generate conversation event
                if(angular.isDefined(conversation)) {
                    conversation.NumUnread = unreads.length + 1;
                    events.push({Action: 3, ID: conversation.ID, Conversation: conversation});
                }
            });

            // Send request
            promise = Message.unread({IDs: ids}).$promise;

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });
            }
        },
        /**
         * Delete a list of messages
         * @param {Array} ids
         */
        deleteMessage: function(ids) {
            var events = [];
            var context = tools.cacheContext();
            var promise;

            // Generate cache events
            _.each(ids, function(id) {
                var message = cache.getMessageCached(id);
                var conversation = cache.getConversationCached(message.ConversationID);

                if(angular.isDefined(conversation)) {
                    if(conversation.NumMessages <= 1) {
                        // Delete conversation
                        events.push({Action: 0, ID: conversation.ID});
                    } else if(conversation.NumMessages > 1) {
                        // Decrease the number of message
                        conversation.NumMessages--;
                        events.push({Action: 3, ID: conversation.ID, Conversation: conversation});
                    }
                }

                events.push({Action: 0, ID: message.ID});
            });

            promise = Message.delete({IDs: ids}).$promise;

            if(context === true) {
                // Send to cache manager
                cache.events(events);
            } else {
                promise.then(function() {
                    // Send to cache manager
                    cache.events(events);
                });
            }
        },
        saveMessage: function() {

        },
        sendMessage: function() {

        },
        discardMessage: function() {

        }
    };
});
