import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import jsPDF from 'jspdf';
import { NgToastService } from 'ng-angular-popup';
import { ProductService } from 'src/app/core/services/product.service';
import * as XLSX from 'xlsx';
import { debounceTime, distinctUntilChanged, firstValueFrom, Subject } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

interface InventoryItem {
  product_id: number;
  product_name: string;
  category_id?: number;
  category: string;
  quantity_in_stock: number;
  unit_price: number;
  unit: string;
  product_image: string;
  status: string;
  created_at: string;
  updated_at: string;
  vendors: string[];
  isChecked?: boolean;
  selectedVendorsForCart?: string[];
  original_quantity?: number;
}

interface InventoryResponse {
  items: InventoryItem[];
  total: number;
  totalPages: number;
}

interface ColumnFilter {
  key: string;
  label: string;
  checked: boolean;
}

interface ExcelProduct {
  'Product Name'?: string;
  'productName'?: string;
  'Category'?: string;
  'category'?: string;
  'Vendors'?: string | string[];
  'vendors'?: string | string[];
  'Quantity'?: number;
  'quantity'?: number;
  'Unit'?: string;
  'unit'?: string;
  'Status'?: string;
  'status'?: string;
}

interface EditForm {
  product_name: string;
  category: string;
  vendors: string;
  selectedVendors: string[];
  quantity_in_stock: number;
  unit: string;
  status: string;
}

@Component({
  selector: 'app-inventory-table',
  templateUrl: './inventory-table.component.html',
  styleUrls: ['./inventory-table.component.scss']
})
export class InventoryTableComponent implements OnInit, OnDestroy {
  inventoryItems: InventoryItem[] = [];
  currentPage = 1;
  itemsPerPage = 10;
  totalItems = 0;
  totalPages = 0;
  showAddProductModal = false;
  showImportModal = false;
  loading = false;
  error = '';
  Math = Math;
  totalVendors = 0;
  showCart = false;
  showAll = true;
  selectedFile : File | null = null;
  isDragging = false;
  showDeleteModal = false;
  selectedItem: InventoryItem | null = null;
  status = 'Available';
  showMoveToCartModal = false;

  isAllSelected = false;

  showFilters = false;
  searchText = '';
  selectedColumns: string[] = [];
  cartColumns: ColumnFilter[] = [
    { key: 'product_name', label: 'Product Name', checked: true },
    { key: 'category', label: 'Category', checked: true },
    { key: 'vendors', label: 'Vendors', checked: true },
  ];
  columns: ColumnFilter[] = [
    { key: 'product_name', label: 'Product Name', checked: true },
    { key: 'status', label: 'Status', checked: true },
    { key: 'category', label: 'Category', checked: true },
    { key: 'vendors', label: 'Vendors', checked: true },
    { key: 'quantity_in_stock', label: 'Quantity', checked: true },
    { key: 'unit', label: 'Unit', checked: true }
  ];

  refreshSubscription: any;
  selectedItems: InventoryItem[] = [];
  editingItem: InventoryItem | null = null;
  editForm: EditForm = {
    product_name: '',
    category: '',
    vendors: '',
    selectedVendors: [],
    quantity_in_stock: 0,
    unit: '',
    status: ''
  };

  availableVendors: string[] = [
    'Zepto',
    'Blinkit',
    'Fresh Meat',
    'Swiggy',
  ];
  availableCategories: string[] = [];

  cartItems: InventoryItem[] = [];
  cartCurrentPage = 1;
  cartItemsPerPage = 3;
  selectedItemsForCart: InventoryItem[] = [];
  cartTotalPages = 0;

  showCartDeleteModal = false;
  itemToDeleteFromCart: InventoryItem | null = null;

  showMoveToCartDeleteModal = false;
  itemToDeleteFromMoveToCart: InventoryItem | null = null;

  private searchSubject = new Subject<string>();
  private searchSubscription: any;

  isUploading = false;

  constructor(
    private productService: ProductService,
    private elementRef: ElementRef,
    private toast: NgToastService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadInventoryItems();
    this.loadVendorCount();
    this.loadVendorsAndCategories();
    
    // Load cart items from session storage
    this.cartItems = this.getCartFromSession();

    // search subscription with debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300), 
      distinctUntilChanged() // Only emit if value is different from previous
    ).subscribe(searchValue => {
      this.searchText = searchValue;
      if (this.showCart) {
        this.loadCartItems();
      } else {
        this.currentPage = 1; // Reset to first page when searching
        this.loadInventoryItems();
      }
    });

    // Subscribe to refresh events
    this.refreshSubscription = this.productService.refreshInventory$.subscribe(() => {
      this.loadInventoryItems();
      this.loadVendorCount();
    });
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
    // Clean up the subject
    this.searchSubject.complete();
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const filtersMenu = this.elementRef.nativeElement.querySelector('.filter-menu');
    if (!filtersMenu?.contains(event.target as Node)) {
      this.showFilters = false;
    }
  }

  toggleSelectAll(): void {
    this.isAllSelected = !this.isAllSelected;
    
    // Clear the selectedItems array first if we're deselecting all
    if (!this.isAllSelected) {
      this.selectedItems = [];
    } else {
      // If selecting all, replace selectedItems with all current inventory items
      this.selectedItems = [...this.inventoryItems];
    }

    // Update the isChecked property for all items
    this.inventoryItems.forEach(item => {
      item.isChecked = this.isAllSelected;
    });
  }  

  allFieldsSelected(): boolean {
    return this.inventoryItems.every(item => item.isChecked);
  }
  
  toggleAll(): void {
    this.showAll = true;
    this.showCart = false;
    this.loadInventoryItems();
  }

  toggleCart(): void {
    this.showAll = false;
    this.showCart = true;
    this.loadCartItems();
  } 

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (this.isExcelFile(file)) {
        this.selectedFile = file;
      } else {
        this.toast.error({
          detail: 'Please upload only Excel files (.xlsx, .xls)',
          summary: 'Invalid File',
          duration: 3000
        });
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (this.isExcelFile(file)) {
        this.selectedFile = file;
      } else {
        this.toast.error({
          detail: 'Please upload only Excel files (.xlsx, .xls)',
          summary: 'Invalid File',
          duration: 3000
        });
        input.value = '';
        this.selectedFile = null;
      }
    }
  }
  
  isExcelFile(file: File): boolean {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    return allowedTypes.includes(file.type);
  }

  uploadFileForProcessing(file: File): void {
    if (!file) return;
    
    this.isUploading = true;
    const fileName = file.name;
    const fileType = file.type;

    this.productService.getUploadUrl(fileName, fileType).subscribe({
      next: async (response) => {
        try {
          // Upload to S3
          const headers = new HttpHeaders()
            .set('Content-Type', fileType)
            .set('Skip-Auth', 'true');

          await this.http.put(response.uploadUrl, file, { headers }).toPromise();

          this.toast.success({
            detail: 'File uploaded successfully!',
            summary: 'Success',
            duration: 3000
          });

          this.closeUploadModal();
        } catch (error) {
          console.error('Error uploading file:', error);
          this.toast.error({
            detail: 'Failed to upload file',
            summary: 'Error',
            duration: 3000
          });
        } finally {
          this.isUploading = false;
          this.showImportModal = false;
        }
      },
      error: (error) => {
        console.error('Error getting upload URL:', error);
        this.toast.error({
          detail: 'Failed to get upload URL',
          summary: 'Error',
          duration: 3000
        });
        this.isUploading = false;
        this.showImportModal = false;
      }
    });
  }

  onShowFilesClick(){
    this.router.navigate(['/file-uploads']);
  }
  
  openUploadModal(): void {
    this.showImportModal = true;
  }

  closeUploadModal(): void {
    this.showImportModal = false;
    this.selectedFile = null;
  }

  openDeleteModal(item: InventoryItem): void {
    this.showDeleteModal = true;
    this.selectedItem = item;
  } 

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.selectedItem = null;
  }

  loadInventoryItems(): void {
    const params = {
      page: this.currentPage,
      limit: this.itemsPerPage,
      search: this.searchText,
      columns: this.selectedColumns.join(',')
    };

    this.loading = true;
    this.error = '';
    this.productService.getInventoryItems(params).subscribe({
      next: (response: InventoryResponse) => {
        this.inventoryItems = response.items;
        this.totalItems = response.total;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (err: Error) => {
        console.error('Error loading inventory items:', err);
        this.error = 'Failed to load inventory items. Please try again.';
        this.loading = false;
      }
    });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadInventoryItems();
    if (this.inventoryItems && this.selectedItems) {
      this.isAllSelected = this.inventoryItems.every(item => this.selectedItems.includes(item));
    }
  }

  get pages(): number[] {
    const totalPages = Math.min(5, this.totalPages || 0);
    const currentPage = this.currentPage;
    const pages: number[] = [];
    
    if (this.totalPages && this.totalPages <= 5) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else if (this.totalPages) {
      pages.push(1);
      
      let start = Math.max(2, currentPage - 1);
      let end = Math.min((this.totalPages - 1), currentPage + 1);
      
      if (start > 2) {
        pages.push(-1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < this.totalPages - 1) {
        pages.push(-1);
      }
      
      pages.push(this.totalPages);
    }
    
    return pages;
  }

  openAddProductModal(): void {
    this.showAddProductModal = true;
  }

  closeAddProductModal(): void {
    this.showAddProductModal = false;
  }

  importProducts(): void {
    this.showImportModal = true;
  }

  onProductAdded(newProduct: any): void {
    this.loadInventoryItems(); // Refresh the list
    this.closeAddProductModal();
  }


  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  onColumnToggle(column: ColumnFilter): void {
    column.checked = !column.checked;
    this.selectedColumns = this.columns
      .filter(col => col.checked)
      .map(col => col.key);
  }

  onSearch(event: Event): void {
    const searchValue = (event.target as HTMLInputElement).value;
    this.searchSubject.next(searchValue); // Emit the new search value
  }

  loadVendorCount(): void {
    this.productService.getVendorCount().subscribe({
      next: (count: number) => {
        this.totalVendors = count;
      },
      error: (error: Error) => {
        console.error('Error loading vendor count:', error);
      }
    });
  }

  downloadAll(): void {
    // Determine which items to download (selected items or all items)
    const itemsToDownload = this.selectedItems.length > 0 ? this.selectedItems : this.inventoryItems;

    // Format the data
    const formattedData = itemsToDownload.map((item: InventoryItem) => ({
      'Product Name': item.product_name,
      'Category': item.category,
      'Status': item.quantity_in_stock > 0 ? 'Available' : 'Sold Out',
      'Vendors': Array.isArray(item.vendors) ? item.vendors.join(', ') : item.vendors,
      'Quantity': item.quantity_in_stock,
      'Unit': item.unit,
      'Created At': new Date(item.created_at).toLocaleDateString(),
      'Updated At': new Date(item.updated_at).toLocaleDateString()
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = this.selectedItems.length > 0 ? 
      `selected_inventory_${new Date().toISOString().split('T')[0]}.xlsx` :
      `inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.download = fileName;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    // Show success message
    this.toast.success({
      detail: `${itemsToDownload.length} items downloaded`,
      summary: 'Success',
      duration: 3000
    });
  }
  downloadField(item: any): void {
    const doc = new jsPDF();
    const data: { [key: string]: any } = {
      'Product Name': item.product_name,
      'Category': item.category,
      'Status': item.status,
      'Vendors': Array.isArray(item.vendors) ? item.vendors.join(', ') : item.vendors,
      'Quantity': item.quantity_in_stock,
      'Unit': item.unit,
      'Created At': new Date(item.created_at).toLocaleDateString(),
      'Updated At': new Date(item.updated_at).toLocaleDateString()
    };
  
    let yOffset = 10; // Start position for text
  
    Object.keys(data).forEach((key) => {
      doc.text(`${key}: ${data[key]}`, 10, yOffset);
      yOffset += 10; // Move down for the next line
    });
  
    doc.save(`${item.product_name}.pdf`); // Save as PDF with dynamic filename
  }   

  deleteProduct(): void {
    if (this.selectedItem) {
      this.productService.deleteProduct(this.selectedItem.product_id.toString()).subscribe({
        next: () => {
          this.toast.success({
            detail: 'Product deleted successfully',
            summary: 'Success',
            duration: 1000
          });
          this.loadInventoryItems();
          this.closeDeleteModal();
        },
        error: (error) => {
          this.toast.error({
            detail: 'Failed to delete product',
            summary: 'Error',
            duration: 2000
          });
        }
      });
    } else {
      this.toast.error({
        detail: 'No product selected for deletion',
        summary: 'Error',
        duration: 2000
      });
    } 
  }

 // cart functions

 isVendorSelectedForCart(item: InventoryItem, vendor: string): boolean {
    if (!item.selectedVendorsForCart) {
      item.selectedVendorsForCart = [];
    }
    return item.selectedVendorsForCart.includes(vendor);
  }

toggleVendorSelectionForCart(item: InventoryItem, vendor: string): void {
    if (!item.selectedVendorsForCart) {
      item.selectedVendorsForCart = [];
    }
    
    const index = item.selectedVendorsForCart.indexOf(vendor);
    if (index === -1) {
      item.selectedVendorsForCart.push(vendor);
    } else {
      item.selectedVendorsForCart.splice(index, 1);
    }
  }
  increaseQuantity(item: InventoryItem): Promise<void> | void {
    if (this.showCart) {
      return firstValueFrom(this.productService.getProduct(item.product_id.toString()))
        .then(originalItem => {
          if (originalItem && originalItem.quantity_in_stock > 0) {
            const newStockQuantity = originalItem.quantity_in_stock - 1;
            const newCartQuantity = item.quantity_in_stock + 1;
            
            const updatePayload = {
              product_id: originalItem.product_id,
              quantity_in_stock: newStockQuantity,
              status: newStockQuantity === 0 ? 2 : 1
            };
            
            return firstValueFrom(this.productService.updateCartProduct(originalItem.product_id.toString(), updatePayload))
              .then(() => {
                const inventoryItem = this.inventoryItems.find(i => i.product_id === item.product_id);
                if (inventoryItem) {
                  inventoryItem.quantity_in_stock = newStockQuantity;
                }
                item.quantity_in_stock = newCartQuantity;
                const cartItem = this.cartItems.find(i => i.product_id === item.product_id);
                if (cartItem) {
                  cartItem.quantity_in_stock = newCartQuantity;
                }
                this.saveCartToSession(this.cartItems);
                return Promise.resolve();
              });
          }
          this.toast.error({
            detail: 'Item is out of stock',
            summary: 'Error',
            duration: 3000
          });
          return Promise.resolve();
        })
        .catch(error => {
          console.error('Error updating quantity:', error);
          this.toast.error({
            detail: 'Failed to update quantity',
            summary: 'Error',
            duration: 3000
          });
          return Promise.reject(error);
        });
    } else {
      const maxQuantity = item.original_quantity || item.quantity_in_stock;
      if (item.quantity_in_stock < maxQuantity) {
        item.quantity_in_stock++;
      }
      return;
    }
  }
  
  decreaseQuantity(item: InventoryItem): Promise<void> | void {
    if (this.showCart) {
      if (item.quantity_in_stock > 0) {
        return firstValueFrom(this.productService.getProduct(item.product_id.toString()))
          .then(originalItem => {
            const newStockQuantity = originalItem.quantity_in_stock + 1;
            const newCartQuantity = item.quantity_in_stock - 1;
            
            const updatePayload = {
              product_id: originalItem.product_id,
              quantity_in_stock: newStockQuantity,
              status: newStockQuantity === 0 ? 2 : 1
            };
            
            return firstValueFrom(this.productService.updateCartProduct(originalItem.product_id.toString(), updatePayload))
              .then(() => {
                const inventoryItem = this.inventoryItems.find(i => i.product_id === item.product_id);
                if (inventoryItem) {
                  inventoryItem.quantity_in_stock = newStockQuantity;
                }
                item.quantity_in_stock = newCartQuantity;
                const cartItem = this.cartItems.find(i => i.product_id === item.product_id);
                if (cartItem) {
                  cartItem.quantity_in_stock = newCartQuantity;
                }
                this.saveCartToSession(this.cartItems);
                return Promise.resolve();
              });
          })
          .catch(error => {
            console.error('Error updating quantity:', error);
            this.toast.error({
              detail: 'Failed to update quantity',
              summary: 'Error',
              duration: 3000
            });
            return Promise.reject(error);
          });
      }
      return Promise.resolve();
    } else {
      if (item.quantity_in_stock > 0) {
        item.quantity_in_stock--;
      }
      return;
    }
  }

  openMoveToCartModal(): void {
    if (!this.selectedItems || this.selectedItems.length === 0) {
      this.toast.error({
        detail: 'Please select items to move to cart',
        summary: 'No Items Selected',
        duration: 3000
      });
      return;
    }

    // Filter out items with quantity <= 0
    const validItems = this.selectedItems.filter(item => item.quantity_in_stock > 0);
    if (validItems.length === 0) {
      this.toast.error({
        detail: 'Selected items have sold out',
        summary: 'Select available items',
        duration: 3000
      });
      return;
    }
    
    this.selectedItemsForCart = validItems.map(item => ({
      ...item,
      original_quantity: item.quantity_in_stock, // Store original quantity
      quantity_in_stock: item.quantity_in_stock
    }));

    this.cartTotalPages = Math.ceil(this.selectedItemsForCart.length / this.cartItemsPerPage);
    this.cartCurrentPage = 1;
    this.showMoveToCartModal = true;
  }

  closeMoveToCartModal(): void {
    this.showMoveToCartModal = false;
  }

  toggleFileSelection(item: InventoryItem): void {
    if (!this.selectedItems) {
      this.selectedItems = [];
    }

    item.isChecked = !item.isChecked;

    if (item.isChecked) {
      if (!this.selectedItems.includes(item)) {
        this.selectedItems.push(item);
      }
    } else {
      this.selectedItems = this.selectedItems.filter(selectedItem => selectedItem.product_id !== item.product_id);
    }

    if (this.inventoryItems) {
      this.isAllSelected = this.inventoryItems.every(item => item.isChecked);
    }
  }

  startEditing(item: InventoryItem): void {
    this.editingItem = item;
    this.editForm = {
      product_name: item.product_name,
      category: item.category,
      vendors: item.vendors.join(','),
      selectedVendors: [...item.vendors],
      quantity_in_stock: item.quantity_in_stock,
      unit: item.unit,
      status: item.status
    };
  }
  selectedImage: File | null = null;
  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.selectedImage = file;
    }
  }

  saveEdit(item: InventoryItem): void {
    if (this.selectedImage) {
      const fileName = this.selectedImage.name;
      const fileType = this.selectedImage.type;
      
      // First get the presigned URL
      this.productService.getPresignedUrlProductImage(fileName, fileType)
        .subscribe({
          next: (response) => {
            const uploadUrl = response.uploadUrl;
            // Upload to S3 with Skip-Auth header
            const headers = new HttpHeaders()
              .set('Content-Type', fileType)
              .set('Skip-Auth', 'true');

            this.http.put(uploadUrl, this.selectedImage, { headers })
              .subscribe({
                next: () => {
                  // After successful upload, update the product with the image URL
                  const updatedProduct = {
                    ...item,
                    product_name: this.editForm.product_name,
                    category: this.editForm.category,
                    vendors: this.editForm.selectedVendors,
                    quantity_in_stock: Number(this.editForm.quantity_in_stock),
                    unit: this.editForm.unit,
                    status: this.editForm.status,
                    product_image: response.imageUrl
                  };

                  this.productService.updateProduct(item.product_id.toString(), updatedProduct)
                    .subscribe({
                      next: () => {
                        this.toast.success({
                          detail: 'Product updated successfully',
                          summary: 'Success',
                          duration: 3000
                        });
                        this.loadInventoryItems();
                        this.editingItem = null;
                        this.selectedImage = null;
                      },
                      error: (error) => {
                        this.toast.error({
                          detail: 'Failed to update product',
                          summary: 'Error',
                          duration: 3000
                        });
                      }
                    });
                },
                error: (err) => {
                  console.error('Error uploading image:', err);
                  this.toast.error({
                    detail: 'Upload failed',
                    summary: 'Error uploading image.',
                    duration: 3000
                  });
                }
              });
          },
          error: (err) => {
            console.error('Error getting presigned URL:', err);
            this.toast.error({
              detail: 'Upload failed',
              summary: 'Error generating pre-signed URL.',
              duration: 3000
            });
          }
        });
    } else {
      // If no new image is selected, just update the product without changing the image
      const updatedProduct = {
        ...item,
        product_name: this.editForm.product_name,
        category: this.editForm.category,
        vendors: this.editForm.selectedVendors,
        quantity_in_stock: Number(this.editForm.quantity_in_stock),
        unit: this.editForm.unit,
        status: this.editForm.status
      };

      this.productService.updateProduct(item.product_id.toString(), updatedProduct)
        .subscribe({
          next: () => {
            this.toast.success({
              detail: 'Product updated successfully',
              summary: 'Success',
              duration: 3000
            });
            this.loadInventoryItems();
            this.editingItem = null;
          },
          error: (error) => {
            this.toast.error({
              detail: 'Failed to update product',
              summary: 'Error',
              duration: 3000
            });
          }
        });
    }
  }

  cancelEdit(): void {
    this.editingItem = null;
    this.editForm = {
      product_name: '',
      category: '',
      vendors: '',
      selectedVendors: [],
      quantity_in_stock: 0,
      unit: '',
      status: ''
    };
  }

  loadVendorsAndCategories(): void {
    this.productService.getCategories().subscribe({
      next: (categories) => {
        this.availableCategories = categories.map(c => c.category_name);
      },
      error: (error) => {
        console.error('Error loading categories:', error);
      }
    });
  }

  onVendorsChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const selectedVendors = Array.from(select.selectedOptions).map(option => option.value);
    this.editForm.vendors = selectedVendors.join(',');
  }

  toggleVendor(vendor: string): void {
    const index = this.editForm.selectedVendors.indexOf(vendor);
    if (index === -1) {
      // Add vendor if not selected
      this.editForm.selectedVendors.push(vendor);
    } else {
      // Remove vendor if already selected
      this.editForm.selectedVendors.splice(index, 1);
    }
    // Update the vendors string
    this.editForm.vendors = this.editForm.selectedVendors.join(',');
  }

  get cartPaginationPages(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.cartTotalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  onCartPageChange(page: number): void {
    if (page >= 1 && page <= this.cartTotalPages) {
      this.cartCurrentPage = page;
      this.loadCartItems(); // Reload items for the new page
    }
  }

  moveToCart(): void {
    if (!this.selectedItemsForCart.length) {
      this.toast.error({
        detail: 'Please select items to move to cart',
        summary: 'No Items Selected',
        duration: 3000
      });
      return;
    }

    const itemsForCart = this.selectedItemsForCart.map(cartItem => {
      const inventoryItem = this.inventoryItems.find(
        item => item.product_id === cartItem.product_id
      );
      
      if (inventoryItem) {
        const remainingQuantity = Math.max(0, inventoryItem.quantity_in_stock - cartItem.quantity_in_stock);
        
        const updatePayload = {
          product_id: cartItem.product_id,
          quantity_in_stock: remainingQuantity,
          status: remainingQuantity === 0 ? 2 : 1
        };

        return firstValueFrom(this.productService.updateCartProduct(cartItem.product_id.toString(), updatePayload));
      }
      return Promise.resolve();
    });

    Promise.all(itemsForCart)
      .then(() => {
        // Get current cart items
        const currentCart = this.getCartFromSession();
        
        // Update or add items to cart
        this.selectedItemsForCart.forEach(selectedItem => {
          const existingCartItem = currentCart.find(item => item.product_id === selectedItem.product_id);
          
          if (existingCartItem) {
            // Update quantity if item exists
            existingCartItem.quantity_in_stock += selectedItem.quantity_in_stock;
          } else {
            // Add new item if it doesn't exist
            currentCart.push({
              ...selectedItem,
              quantity_in_stock: selectedItem.quantity_in_stock
            });
          }
        });

        // Save updated cart to session storage
        this.cartItems = currentCart;
        this.saveCartToSession(this.cartItems);

        // Clear selections
        this.selectedItems = [];
        this.selectedItemsForCart = [];
        this.isAllSelected = false;
        this.showMoveToCartModal = false;
        
        // Refresh inventory items
        this.loadInventoryItems();
        
        this.toast.success({
          detail: 'Items moved to cart successfully',
          summary: 'Success',
          duration: 3000
        });
      })
      .catch(error => {
        console.error('Error updating inventory:', error);
        this.toast.error({
          detail: 'Error moving items to cart. Please try again.',
          summary: 'Error',
          duration: 3000
        });
      });
  }

  loadCartItems(): void {
    this.loading = true;
    
    // Get cart items from session storage
    const allCartItems = this.getCartFromSession();
    
    // Apply search filter
    const filteredItems = this.filterCartItems(allCartItems);
    
    // Calculate pagination for cart view
    const startIndex = (this.cartCurrentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    
    // Update cart items with filtered results
    this.cartItems = filteredItems;
    
    // Update the paginated items for display
    const paginatedItems = filteredItems.slice(startIndex, endIndex);
    this.inventoryItems = paginatedItems;  // Only for display purposes
    
    this.cartTotalPages = Math.ceil(filteredItems.length / this.itemsPerPage);
    
    // Reset page if needed
    if (this.cartCurrentPage > this.cartTotalPages && this.cartTotalPages > 0) {
      this.cartCurrentPage = 1;
      this.loadCartItems();
    }
    
    this.loading = false;
  }

  get paginatedSelectedItems(): InventoryItem[] {
    const startIndex = (this.cartCurrentPage - 1) * this.cartItemsPerPage;
    const endIndex = startIndex + this.cartItemsPerPage;
    return this.selectedItemsForCart.slice(startIndex, endIndex);
  }

  // Add this helper method to check if an item is in cart
  isItemInCart(productId: number): boolean {
    return this.cartItems.some(item => item.product_id === productId);
  }

  // Add these methods to handle session storage
  private saveCartToSession(items: InventoryItem[]): void {
    sessionStorage.setItem('cartItems', JSON.stringify(items));
  }

  private getCartFromSession(): InventoryItem[] {
    const cartData = sessionStorage.getItem('cartItems');
    return cartData ? JSON.parse(cartData) : [];
  }


  // First, let's add a method to filter cart items based on search text and selected columns
  filterCartItems(items: InventoryItem[]): InventoryItem[] {
    if (!this.searchText || !this.columns) {
      return items;
    }

    const searchLower = this.searchText.toLowerCase();
    
    return items.filter(item => {
      // Only search through columns that are checked/selected
      return this.columns
        .filter(col => col.checked)
        .some(col => {
          const value = item[col.key as keyof InventoryItem];
          
          if (value === undefined || value === null) {
            return false;
          }

          // Handle arrays (like vendors)
          if (Array.isArray(value)) {
            return value.some(v => v.toString().toLowerCase().includes(searchLower));
          }

          // Handle other types
          return value.toString().toLowerCase().includes(searchLower);
        });
    });
  }

  openCartDeleteModal(item: InventoryItem): void {
    this.itemToDeleteFromCart = item;
    this.showCartDeleteModal = true;
  }

  closeCartDeleteModal(): void {
    this.showCartDeleteModal = false;
    this.itemToDeleteFromCart = null;
  }

  removeFromCart(): void {
    if (!this.itemToDeleteFromCart) return;

    const item = this.itemToDeleteFromCart;
    
    // Update the backend first
    const updatePayload = {
      product_id: item.product_id,
      quantity_in_stock: item.quantity_in_stock // Restore the full quantity
    };

    firstValueFrom(this.productService.updateCartProduct(item.product_id.toString(), updatePayload))
      .then(() => {
        // Remove item from cart in session storage
        this.cartItems = this.cartItems.filter(cartItem => cartItem.product_id !== item.product_id);
        this.saveCartToSession(this.cartItems);
        
        // Refresh both cart and inventory views
        this.loadCartItems();
        this.loadInventoryItems();
        
        this.toast.success({
          detail: 'Item removed from cart',
          summary: 'Success',
          duration: 3000
        });

        // Close the modal
        this.closeCartDeleteModal();
      })
      .catch(error => {
        console.error('Error removing item from cart:', error);
        this.toast.error({
          detail: 'Error removing item from cart. Please try again.',
          summary: 'Error',
          duration: 3000
        });
      });
  }

  openMoveToCartDeleteModal(item: InventoryItem): void {
    this.itemToDeleteFromMoveToCart = item;
    this.showMoveToCartDeleteModal = true;
  }

  closeMoveToCartDeleteModal(): void {
    this.showMoveToCartDeleteModal = false;
    this.itemToDeleteFromMoveToCart = null;
  }

  removeFromMoveToCart(): void {
    if (!this.itemToDeleteFromMoveToCart) return;

    // Remove from selectedItems
    this.selectedItems = this.selectedItems.filter(
      item => item.product_id !== this.itemToDeleteFromMoveToCart!.product_id
    );

    // Remove from selectedItemsForCart
    this.selectedItemsForCart = this.selectedItemsForCart.filter(
      item => item.product_id !== this.itemToDeleteFromMoveToCart!.product_id
    );

    // Uncheck the item in the inventory table
    const inventoryItem = this.inventoryItems.find(
      item => item.product_id === this.itemToDeleteFromMoveToCart!.product_id
    );
    if (inventoryItem) {
      inventoryItem.isChecked = false;
    }

    // Update isAllSelected
    this.isAllSelected = this.inventoryItems.length > 0 && 
      this.inventoryItems.every(item => this.selectedItems.includes(item));

    // Recalculate pagination
    this.cartTotalPages = Math.ceil(this.selectedItemsForCart.length / this.cartItemsPerPage);
    if (this.cartCurrentPage > this.cartTotalPages && this.cartTotalPages > 0) {
      this.cartCurrentPage = this.cartTotalPages;
    }

    // Close the modal
    this.closeMoveToCartDeleteModal();

    // Show success message
    this.toast.success({
      detail: 'Item removed from selection',
      summary: 'Success',
      duration: 3000
    });
  }

  getVendorColor(index: number): string {
    const colors = ['#E8F3FF', '#F3E8FF','#FFF1E8'];  // Light blue, Light purple, Light orange
    return colors[index % colors.length];
  }

  getSelectedVendorsForItem(item: any): string[] {
    return item.selectedVendorsForCart || [];
  }
}
