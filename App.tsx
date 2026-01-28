import { StatusBar } from 'expo-status-bar';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { useState, useEffect } from 'react';

type TodoItem = {
  id: string;
  title: string;
  done: boolean;
};

const INITIAL_TODOS: TodoItem[] = [
  { id: '1', title: 'Draft feature ideas', done: false },
  { id: '2', title: 'Review architecture notes', done: false },
  { id: '3', title: 'Sketch list view layout', done: true },
  { id: '4', title: 'Test on web and device', done: false },
];

export default function App() {
  const [todos, setTodos] = useState<TodoItem[]>(INITIAL_TODOS);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Handle Escape key to cancel editing (desktop/web)
  useEffect(() => {
    if (Platform.OS === 'web' && editingId) {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setEditingId(null);
          setEditingTitle('');
        }
      };
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [editingId]);

  const toggleTodoDone = (id: string) => {
    setTodos((current) =>
      current.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      )
    );
  };

  const addTodo = () => {
    const trimmedTitle = newTodoTitle.trim();
    if (trimmedTitle === '') return;

    const newTodo: TodoItem = {
      id: Date.now().toString(),
      title: trimmedTitle,
      done: false,
    };
    setTodos((current) => [...current, newTodo]);
    setNewTodoTitle('');
  };

  const deleteTodo = (id: string) => {
    setTodos((current) => current.filter((item) => item.id !== id));
  };

  const startEditing = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveEdit = (id: string) => {
    const trimmedTitle = editingTitle.trim();
    if (trimmedTitle === '') {
      cancelEdit();
      return;
    }
    setTodos((current) =>
      current.map((item) =>
        item.id === id ? { ...item, title: trimmedTitle } : item
      )
    );
    setEditingId(null);
    setEditingTitle('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const renderItem = ({ item }: { item: TodoItem }) => {
    const isEditing = editingId === item.id;

    return (
      <View style={styles.todoRow}>
        <Pressable
          onPress={() => toggleTodoDone(item.id)}
          style={({ pressed }) => [
            styles.checkboxButton,
            pressed && styles.checkboxButtonPressed,
          ]}
        >
          <Text style={item.done ? styles.todoStatusDone : styles.todoStatus}>
            {item.done ? '[x]' : '[ ]'}
          </Text>
        </Pressable>
        <View style={styles.titleContainer}>
          {isEditing ? (
            <TextInput
              style={styles.editInput}
              value={editingTitle}
              onChangeText={setEditingTitle}
              onSubmitEditing={() => saveEdit(item.id)}
              onBlur={() => saveEdit(item.id)}
              autoFocus
              selectTextOnFocus
            />
          ) : (
            <Text style={item.done ? styles.todoTitleDone : styles.todoTitle}>
              {item.title}
            </Text>
          )}
        </View>
        {isEditing ? (
          <Pressable
            onPress={cancelEdit}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.cancelButtonPressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => startEditing(item.id, item.title)}
            style={({ pressed }) => [
              styles.editButton,
              pressed && styles.editButtonPressed,
            ]}
          >
            <Text style={styles.editButtonText}>✏️</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => deleteTodo(item.id)}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
          ]}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <View style={styles.container}>
        <Text style={styles.header}>Todos</Text>
        <View style={styles.addTodoContainer}>
          <TextInput
            style={styles.addTodoInput}
            placeholder="Add a new todo..."
            value={newTodoTitle}
            onChangeText={setNewTodoTitle}
            onSubmitEditing={addTodo}
            returnKeyType="done"
          />
          <Pressable
            onPress={addTodo}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
        <FlatList
          data={todos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  addTodoContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  addTodoInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  addButtonPressed: {
    opacity: 0.8,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 16,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  checkboxButton: {
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    justifyContent: 'center',
  },
  checkboxButtonPressed: {
    opacity: 0.8,
  },
  titleContainer: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  editInput: {
    fontSize: 16,
    color: '#111827',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonPressed: {
    opacity: 0.6,
  },
  editButtonText: {
    fontSize: 16,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonPressed: {
    opacity: 0.6,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonPressed: {
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 24,
    color: '#ef4444',
    fontWeight: '300',
  },
  todoStatus: {
    fontFamily: 'System',
    fontSize: 16,
    marginRight: 8,
    color: '#999',
  },
  todoStatusDone: {
    fontFamily: 'System',
    fontSize: 16,
    marginRight: 8,
    color: '#4CAF50',
  },
  todoTitle: {
    fontSize: 16,
    color: '#111827',
  },
  todoTitleDone: {
    fontSize: 16,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
});
