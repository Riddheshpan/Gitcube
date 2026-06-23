import React, { useRef, useState } from "react";
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useColorScheme } from "nativewind";
import { Platform } from "react-native";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    id: "1",
    title: "Welcome to GitCube",
    description: "Manage your repositories, branches, and commits easily from anywhere. Your complete developer companion.",
    icon: "cube-outline" as const,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  {
    id: "2",
    title: "CI/CD Pipelines",
    description: "Track your workflows and deployments in real-time. Never miss a build failure again.",
    icon: "rocket-outline" as const,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  {
    id: "3",
    title: "Project Tracking",
    description: "Manage tickets, issues, and boards seamlessly. Keep your team moving forward.",
    icon: "list-outline" as const,
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  {
    id: "4",
    title: "Stay Connected",
    description: "Get notifications for pull requests, reviews, and mentions directly on your device.",
    icon: "notifications-outline" as const,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
];

export default function Walkthrough() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const completeWalkthrough = async () => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem("has_seen_walkthrough", "true");
      } else {
        await SecureStore.setItemAsync("has_seen_walkthrough", "true");
      }
      // Route back to index so it can correctly evaluate login state
      router.replace("/");
    } catch (e) {
      console.error("Failed to save walkthrough status:", e);
      router.replace("/");
    }
  };

  const nextSlide = () => {
    if (currentIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * width, animated: true });
    } else {
      completeWalkthrough();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f4f4f5] dark:bg-[#121212]">
      <StatusBar style={isDark ? "light" : "dark"} />
      
      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
        >
          {SLIDES.map((slide) => (
            <View key={slide.id} style={{ width }} className="flex-1 items-center justify-center px-8">
              <View className={`w-32 h-32 rounded-full border-4 ${slide.border} ${slide.bg} items-center justify-center mb-8 shadow-sm`}>
                <Ionicons name={slide.icon} size={64} className={slide.color} />
              </View>
              <Text className="text-black dark:text-white text-3xl font-black mb-4 text-center tracking-tight">
                {slide.title}
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-base text-center leading-relaxed">
                {slide.description}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Footer Navigation */}
      <View className="px-6 pb-12 pt-4">
        {/* Pagination Dots */}
        <View className="flex-row justify-center space-x-2 mb-8">
          {SLIDES.map((_, index) => (
            <View
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentIndex 
                  ? "w-8 bg-yellow-500" 
                  : "w-2 bg-gray-300 dark:bg-gray-700"
              }`}
            />
          ))}
        </View>

        <View className="flex-row justify-between items-center space-x-4">
          <TouchableOpacity 
            onPress={completeWalkthrough}
            className="flex-1 py-4 bg-gray-200 dark:bg-gray-800 rounded-xl items-center"
          >
            <Text className="text-gray-700 dark:text-gray-300 font-bold">Skip</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={nextSlide}
            className="flex-1 py-4 bg-yellow-500 rounded-xl items-center shadow-sm"
          >
            <Text className="text-black font-black">
              {currentIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
