'use client';
import { adminDateLabel } from '@/lib/admin/dates';

import { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BlogPost } from '@/types';
import { deleteMultipleImages, extractBlogImageUrls } from '@/lib/utils/deleteImages';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DragDropTable from '@/components/admin/DragDropTable';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function BlogAdminPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'blog'), orderBy('orden', 'asc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as BlogPost));
      setPosts(data);
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const post = posts.find((item) => item.id === id);
      if (post) {
        const imageUrls = extractBlogImageUrls(post);
        if (imageUrls.length > 0) {
          deleteMultipleImages(imageUrls);
        }
      }
      await deleteDoc(doc(db, 'blog', id));
      setPosts((prev) => prev.filter((post) => post.id !== id));
      toast.success('Entrada eliminada');
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Error al eliminar la entrada');
    }
  };

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Blog</h1>
              <p className="text-gray-600 mt-1">Gestioná las entradas del blog</p>
            </div>
            <Button asChild className="bg-black hover:bg-gray-800 text-white">
              <Link href="/admin/blog/nuevo">
                <Plus className="mr-2 h-5 w-5" />
                Nueva entrada
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">Cargando...</div>
          ) : (
            <DragDropTable
              items={posts}
              collectionName="blog"
              onItemsChange={setPosts}
              onDelete={handleDelete}
              editPath="/admin/blog"
              columns={[
                {
                  key: 'titulo',
                  label: 'Título',
                  render: (item: BlogPost) => (
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900">{item.titulo}</p>
                      <p className="text-sm text-gray-500">{item.slug}</p>
                    </div>
                  ),
                },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (item: BlogPost) => (
                    <div className="flex gap-2">
                      <Badge
                        variant={item.visible ? 'default' : 'secondary'}
                        className={item.visible ? 'bg-primary text-white' : undefined}
                      >
                        {item.visible ? 'Visible' : 'Oculto'}
                      </Badge>
                      {item.destacado && (
                        <Badge className="bg-black text-white hover:bg-black">Destacado</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'fecha',
                  label: 'Publicación',
                  render: (item: BlogPost) => (
                    <span className="text-sm text-gray-600">
                      {adminDateLabel(item.fechaPublicacion)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
